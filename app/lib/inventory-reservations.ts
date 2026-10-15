import { ecommerceQuery, getEcommerceDbPool, query } from "./db";

export interface ReservationHold {
  id: string;
  productId: string;
  orderId?: string | null;
  sessionId?: string | null;
  quantity: number;
  status: "HOLD" | "COMMITTED" | "RELEASED";
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Automatically releases any holds that have expired past their 10-minute window.
 */
export async function releaseExpiredHolds(): Promise<number> {
  try {
    const res = await ecommerceQuery<{ count: string }>(
      `WITH updated AS (
         UPDATE public.ecom_inventory_reservations
         SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'HOLD' AND expires_at <= CURRENT_TIMESTAMP
         RETURNING id
       )
       SELECT count(*)::text AS count FROM updated`,
    );
    return Number(res.rows[0]?.count ?? 0);
  } catch (error) {
    console.error("Error releasing expired inventory holds:", error);
    return 0;
  }
}

/**
 * Returns a map of productId -> total currently held (active reservation) quantity.
 */
export async function getActiveHoldCounts(
  productIds?: string[],
): Promise<Map<string, number>> {
  await releaseExpiredHolds();

  const holds = new Map<string, number>();
  if (productIds && productIds.length === 0) {
    return holds;
  }

  try {
    let sql = `
      SELECT product_id, SUM(quantity) AS held_quantity
      FROM public.ecom_inventory_reservations
      WHERE status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP
    `;
    const params: unknown[] = [];

    if (productIds && productIds.length > 0) {
      sql += ` AND product_id = ANY($1::uuid[])`;
      params.push(productIds);
    }

    sql += ` GROUP BY product_id`;

    const res = await ecommerceQuery<{ product_id: string; held_quantity: string | number }>(
      sql,
      params,
    );

    for (const row of res.rows) {
      holds.set(row.product_id, Number(row.held_quantity) || 0);
    }
  } catch (error) {
    console.error("Error fetching active hold counts:", error);
  }

  return holds;
}

/**
 * Creates temporary 10-minute holds for items during checkout.
 * Verifies that available quantity (base stock minus active holds) is sufficient.
 */
export async function createHoldReservations(
  items: Array<{ productId: string; quantity: number }>,
  options: { orderId?: string; sessionId?: string; holdMinutes?: number } = {},
): Promise<{ success: boolean; error?: string; expiresAt?: Date; reservationIds?: string[] }> {
  if (!items.length) {
    return { success: false, error: "No items provided for reservation." };
  }

  const holdMinutes = options.holdMinutes ?? 10;
  const client = await getEcommerceDbPool().connect();

  try {
    await client.query("BEGIN");

    // Clean up expired holds inside this client
    await client.query(
      `UPDATE public.ecom_inventory_reservations
       SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'HOLD' AND expires_at <= CURRENT_TIMESTAMP`,
    );

    const productIds = items.map((item) => item.productId);
    const sortedProductIds = [...new Set(productIds)].sort();

    // 1. Fetch catalog stock overrides under deterministic row lock
    const catalogResult = await client.query<{
      product_id: string;
      stock_override: number | null;
      is_published: boolean;
    }>(
      `SELECT product_id, stock_override, is_published
       FROM public.ecom_product_catalog
       WHERE product_id = ANY($1::uuid[])
       ORDER BY product_id ASC
       FOR UPDATE`,
      [sortedProductIds],
    );
    const catalogMap = new Map(catalogResult.rows.map((row) => [row.product_id, row]));

    // 2. Fetch ERP bin stock
    const erpResult = await query<{ product_id: string; stock_quantity: string | number }>(
      `SELECT product_id, SUM(quantity) as stock_quantity
       FROM public.inventory_bin_stock
       WHERE product_id = ANY($1::uuid[])
       GROUP BY product_id`,
      [productIds],
    );
    const erpStockMap = new Map(erpResult.rows.map((r) => [r.product_id, Number(r.stock_quantity) || 0]));

    // 3. Fetch active holds
    const holdsResult = await client.query<{ product_id: string; held_quantity: string | number }>(
      `SELECT product_id, SUM(quantity) AS held_quantity
       FROM public.ecom_inventory_reservations
       WHERE status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP AND product_id = ANY($1::uuid[])
       GROUP BY product_id`,
      [productIds],
    );
    const activeHoldsMap = new Map(holdsResult.rows.map((r) => [r.product_id, Number(r.held_quantity) || 0]));

    // 4. Check availability for each item
    for (const item of items) {
      const cat = catalogMap.get(item.productId);
      if (!cat || !cat.is_published) {
        await client.query("ROLLBACK");
        return { success: false, error: "One or more products are not published for sale." };
      }

      const baseStock = cat.stock_override !== null && cat.stock_override !== undefined
        ? Number(cat.stock_override)
        : (erpStockMap.get(item.productId) ?? 0);

      const currentlyHeld = activeHoldsMap.get(item.productId) ?? 0;
      const availableStock = Math.max(0, baseStock - currentlyHeld);

      if (item.quantity > availableStock) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: `Insufficient stock available for requested quantity. Available: ${availableStock}.`,
        };
      }
    }

    // 5. Insert reservation holds
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);
    const reservationIds: string[] = [];

    for (const item of items) {
      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO public.ecom_inventory_reservations (
           product_id, order_id, quantity, status, expires_at
         )
         VALUES ($1, $2, $3, 'HOLD', $4)
         RETURNING id`,
        [item.productId, options.orderId ?? null, item.quantity, expiresAt],
      );
      reservationIds.push(insertResult.rows[0].id);
    }

    await client.query("COMMIT");
    return { success: true, expiresAt, reservationIds };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Error creating inventory hold reservations:", error);
    return { success: false, error: "Failed to reserve inventory hold." };
  } finally {
    client.release();
  }
}

/**
 * Commits active reservations when payment is confirmed.
 * Safely decrements website stock overrides if they were configured.
 */
export async function commitReservationsForOrder(orderId: string): Promise<boolean> {
  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");

    // Fetch active holds for this order
    const holds = await client.query<{ id: string; product_id: string; quantity: number }>(
      `SELECT id, product_id, quantity
       FROM public.ecom_inventory_reservations
       WHERE order_id = $1 AND status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP`,
      [orderId],
    );

    if (holds.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    // Transition holds to COMMITTED
    await client.query(
      `UPDATE public.ecom_inventory_reservations
       SET status = 'COMMITTED', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP`,
      [orderId],
    );

    // Safely deduct from ecom_product_catalog.stock_override if set
    for (const hold of holds.rows) {
      await client.query(
        `UPDATE public.ecom_product_catalog
         SET stock_override = GREATEST(0, stock_override - $2),
             updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1 AND stock_override IS NOT NULL`,
        [hold.product_id, hold.quantity],
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(`Error committing reservations for order ${orderId}:`, error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Releases active reservations when an order or payment attempt is cancelled/rejected.
 */
export async function releaseReservationsForOrder(orderId: string): Promise<number> {
  try {
    const res = await ecommerceQuery<{ count: string }>(
      `WITH updated AS (
         UPDATE public.ecom_inventory_reservations
         SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status = 'HOLD'
         RETURNING id
       )
       SELECT count(*)::text AS count FROM updated`,
      [orderId],
    );
    return Number(res.rows[0]?.count ?? 0);
  } catch (error) {
    console.error(`Error releasing reservations for order ${orderId}:`, error);
    return 0;
  }
}

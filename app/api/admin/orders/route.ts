import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { NextRequest } from "next/server";
import { ecommerceQuery, getEcommerceDbPool, query } from "@/app/lib/db";
import { enqueueOrderNotification } from "@/app/lib/notification-outbox";

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_REVIEW", "CONFIRMED", "REJECTED", "CANCELLED"],
  IN_REVIEW: ["CONFIRMED", "REJECTED", "CANCELLED"],
  PAYMENT_REVIEW: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKAGED", "IN_TRANSIT", "SHIPPED", "CANCELLED"],
  PACKAGED: ["IN_TRANSIT", "SHIPPED", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "FAILED"],
  SHIPPED: ["DELIVERED", "FAILED"],
};

export interface StaffOrderTransitionInput {
  orderNumber: string;
  status: string;
  staffEmail: string;
  message?: string;
  trackingUrl?: string;
  carrierName?: string;
  awbNumber?: string;
}

export interface TransitionResultSuccess {
  success: true;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  carrierName?: string;
  awbNumber?: string;
  trackingUrl?: string;
  requiresManualRefund?: boolean;
}

export interface TransitionResultError {
  success: false;
  statusCode: number;
  error: string;
}

export type TransitionResult = TransitionResultSuccess | TransitionResultError;

/**
 * Executes a staff-initiated order status transition atomically within an active database transaction.
 */
export async function processStaffOrderStatusTransition(
  params: StaffOrderTransitionInput,
  client: { query: <T = any>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }> },
  erpQueryFn: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> = query,
): Promise<TransitionResult> {
  const { orderNumber, status, staffEmail } = params;
  const message = params.message?.trim() || "";
  const trackingUrl = params.trackingUrl?.trim() || "";
  const carrierName = params.carrierName?.trim() || "";
  const awbNumber = params.awbNumber?.trim() || "";

  // 1. Fetch order under row lock
  const result = await client.query<{
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    billing_address_snapshot: { email?: string; contactPerson?: string; phone?: string };
    notes: string | null;
  }>(
    `SELECT id, order_number, status, payment_status, billing_address_snapshot, notes
     FROM public.ecom_orders WHERE order_number = $1 FOR UPDATE`,
    [orderNumber],
  );
  const order = result.rows?.[0];
  if (!order) {
    return { success: false, statusCode: 404, error: "Order request not found." };
  }

  // 2. Validate allowed transitions
  const validTransition = ORDER_TRANSITIONS[order.status]?.includes(status);
  const isReviewStage = ["PENDING", "IN_REVIEW", "PAYMENT_REVIEW"].includes(order.status);
  const isFulfillment = ["CONFIRMED", "PROCESSING", "PACKAGED", "IN_TRANSIT", "SHIPPED"].includes(order.status);
  if (!validTransition || !(isReviewStage || isFulfillment)) {
    return { success: false, statusCode: 409, error: "This order cannot make that transition." };
  }

  let requiresManualRefund = false;
  let orderNotesToUpdate = order.notes || null;

  // 3. Status-specific checks & actions
  if (status === "CONFIRMED") {
    // FIX 3: Verify payment is genuinely PAID and recorded in ecom_payments
    if (order.payment_status !== "PAID") {
      return {
        success: false,
        statusCode: 422,
        error: "Cannot confirm an unpaid order. Payment status must be PAID.",
      };
    }

    const paymentCheck = await client.query<{ id: string; status: string }>(
      `SELECT id, status
       FROM public.ecom_payments
       WHERE ecom_order_id = $1 AND status = 'CAPTURED'
       LIMIT 1`,
      [order.id],
    );
    if (!paymentCheck.rows || paymentCheck.rows.length === 0) {
      return {
        success: false,
        statusCode: 422,
        error: "Cannot confirm order without a verified, captured payment record.",
      };
    }

    // FIX 2: Inventory reservation & allocation check
    const itemsRes = await client.query<{ product_id: string; quantity: number }>(
      `SELECT product_id, quantity
       FROM public.ecom_order_items
       WHERE ecom_order_id = $1`,
      [order.id],
    );
    const orderItems: Array<{ product_id: string; quantity: number }> = itemsRes.rows || [];
    if (orderItems.length === 0) {
      return {
        success: false,
        statusCode: 422,
        error: "Cannot confirm order: No line items found for this order.",
      };
    }

    // Query active unexpired holds
    const activeHoldsRes = await client.query<{ id: string; product_id: string; quantity: number }>(
      `SELECT id, product_id, quantity
       FROM public.ecom_inventory_reservations
       WHERE order_id = $1 AND status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP`,
      [order.id],
    );
    const activeHolds: Array<{ id: string; product_id: string; quantity: number }> = activeHoldsRes.rows || [];

    const heldByProduct = new Map<string, number>();
    for (const hold of activeHolds) {
      heldByProduct.set(
        hold.product_id,
        (heldByProduct.get(hold.product_id) || 0) + Number(hold.quantity),
      );
    }

    const hasCompleteActiveHolds =
      orderItems.length > 0 &&
      orderItems.every((item) => {
        const held = heldByProduct.get(item.product_id) || 0;
        return held >= Number(item.quantity);
      });

    if (hasCompleteActiveHolds) {
      // Commit active unexpired holds
      await client.query(
        `UPDATE public.ecom_inventory_reservations
         SET status = 'COMMITTED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP`,
        [order.id],
      );

      for (const item of orderItems) {
        await client.query(
          `UPDATE public.ecom_product_catalog
           SET stock_override = GREATEST(0, stock_override - $2),
               updated_at = CURRENT_TIMESTAMP
           WHERE product_id = $1 AND stock_override IS NOT NULL`,
          [item.product_id, item.quantity],
        );
      }
    } else {
      // Active holds are expired or incomplete.
      // Verify whether fresh stock is available before allocating!
      const productIds = orderItems.map((item) => item.product_id);

      interface CatalogRow {
        product_id: string;
        stock_override: number | null;
        is_published: boolean;
      }
      const catalogRes = await client.query<CatalogRow>(
        `SELECT product_id, stock_override, is_published
         FROM public.ecom_product_catalog
         WHERE product_id = ANY($1::uuid[])`,
        [productIds],
      );
      const catalogMap = new Map<string, CatalogRow>(
        (catalogRes.rows || []).map((row) => [row.product_id, row]),
      );

      // Query ERP bin stock using erpQueryFn (read-only ERP database)
      const erpRes = await erpQueryFn(
        `SELECT product_id, SUM(quantity) as stock_quantity
         FROM public.inventory_bin_stock
         WHERE product_id = ANY($1::uuid[])
         GROUP BY product_id`,
        [productIds],
      );
      const erpStockRows = (erpRes.rows || []) as Array<{ product_id: string; stock_quantity: string | number }>;
      const erpStockMap = new Map(erpStockRows.map((r) => [r.product_id, Number(r.stock_quantity) || 0]));

      // Query active holds of OTHER orders
      interface HoldRow {
        product_id: string;
        held_quantity: string | number;
      }
      const otherHoldsRes = await client.query<HoldRow>(
        `SELECT product_id, SUM(quantity) as held_quantity
         FROM public.ecom_inventory_reservations
         WHERE status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP
           AND (order_id IS NULL OR order_id != $1)
           AND product_id = ANY($2::uuid[])
         GROUP BY product_id`,
        [order.id, productIds],
      );
      const otherHoldsMap = new Map<string, number>(
        (otherHoldsRes.rows || []).map((r) => [r.product_id, Number(r.held_quantity) || 0]),
      );

      for (const item of orderItems) {
        const cat = catalogMap.get(item.product_id);
        if (!cat || !cat.is_published) {
          return {
            success: false,
            statusCode: 409,
            error: `Cannot confirm order: Product ${item.product_id} is no longer published for sale. Order remains in ${order.status}.`,
          };
        }

        const baseStock =
          cat.stock_override !== null && cat.stock_override !== undefined
            ? Number(cat.stock_override)
            : (erpStockMap.get(item.product_id) ?? 0);

        const currentlyHeld = otherHoldsMap.get(item.product_id) ?? 0;
        const availableStock = Math.max(0, baseStock - currentlyHeld);

        if (item.quantity > availableStock) {
          return {
            success: false,
            statusCode: 409,
            error: `Cannot confirm order: Insufficient stock available for product ${item.product_id} (requested ${item.quantity}, available ${availableStock}). Order remains in ${order.status}.`,
          };
        }
      }

      // Stock is available! Release expired holds for this order
      await client.query(
        `UPDATE public.ecom_inventory_reservations
         SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status = 'HOLD'`,
        [order.id],
      );

      // Insert new COMMITTED reservations for this order
      for (const item of orderItems) {
        await client.query(
          `INSERT INTO public.ecom_inventory_reservations (
             product_id, order_id, quantity, status, expires_at
           )
           VALUES ($1, $2, $3, 'COMMITTED', CURRENT_TIMESTAMP)`,
          [item.product_id, order.id, item.quantity],
        );

        await client.query(
          `UPDATE public.ecom_product_catalog
           SET stock_override = GREATEST(0, stock_override - $2),
               updated_at = CURRENT_TIMESTAMP
           WHERE product_id = $1 AND stock_override IS NOT NULL`,
          [item.product_id, item.quantity],
        );
      }
    }
  } else if (status === "CANCELLED" || status === "REJECTED") {
    // Release active holds
    await client.query(
      `UPDATE public.ecom_inventory_reservations
       SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND status = 'HOLD'`,
      [order.id],
    );

    // If order was paid, record that manual refund is required; do NOT falsely mark REFUNDED
    if (order.payment_status === "PAID") {
      requiresManualRefund = true;
      const refundNote = "[ACTION REQUIRED: Order cancelled after payment was captured. Manual reconciliation/refund required.]";
      orderNotesToUpdate = orderNotesToUpdate ? `${orderNotesToUpdate} ${refundNote}` : refundNote;
    }
  }

  // 4. Update order status
  await client.query(
    `UPDATE public.ecom_orders
     SET status = $2, notes = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [order.id, status, orderNotesToUpdate],
  );

  let shipmentCarrier: string | undefined = carrierName || undefined;
  let shipmentAwb: string | undefined = awbNumber || undefined;
  let shipmentTrackingUrl: string | undefined = trackingUrl || undefined;

  // 5. FIX 1: Manage shipment tracking (Reuse existing shipment to avoid duplicates)
  if (["PACKAGED", "IN_TRANSIT", "SHIPPED", "DELIVERED", "FAILED"].includes(status)) {
    const existingShipmentRes = await client.query<{
      id: string;
      carrier_name: string | null;
      awb_number: string | null;
      tracking_url: string | null;
      status: string;
      shipped_at: Date | null;
      delivered_at: Date | null;
      notes: string | null;
    }>(
      `SELECT id, carrier_name, awb_number, tracking_url, status, shipped_at, delivered_at, notes
       FROM public.ecom_shipments
       WHERE ecom_order_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [order.id],
    );
    const existingShipment = existingShipmentRes.rows?.[0];

    if (existingShipment) {
      shipmentCarrier = carrierName || existingShipment.carrier_name || undefined;
      shipmentAwb = awbNumber || existingShipment.awb_number || undefined;
      shipmentTrackingUrl = trackingUrl || existingShipment.tracking_url || undefined;
    }

    if (status === "PACKAGED") {
      if (existingShipment) {
        await client.query(
          `UPDATE public.ecom_shipments
           SET status = 'PACKAGED',
               carrier_name = COALESCE($2, carrier_name),
               awb_number = COALESCE($3, awb_number),
               tracking_url = COALESCE($4, tracking_url),
               notes = COALESCE($5, notes),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            existingShipment.id,
            carrierName || null,
            awbNumber || null,
            trackingUrl || null,
            message || null,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO public.ecom_shipments (
             ecom_order_id, carrier_name, awb_number, tracking_url, status, notes
           )
           VALUES ($1, $2, $3, $4, 'PACKAGED', $5)`,
          [
            order.id,
            carrierName || null,
            awbNumber || null,
            trackingUrl || null,
            message || "Order packaged and ready for carrier pickup.",
          ],
        );
      }
    } else if (status === "IN_TRANSIT" || status === "SHIPPED") {
      if (existingShipment) {
        await client.query(
          `UPDATE public.ecom_shipments
           SET status = 'IN_TRANSIT',
               carrier_name = COALESCE($2, carrier_name, 'Internal Courier'),
               awb_number = COALESCE($3, awb_number),
               tracking_url = COALESCE($4, tracking_url),
               shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP),
               notes = COALESCE($5, notes),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            existingShipment.id,
            carrierName || null,
            awbNumber || null,
            trackingUrl || null,
            message || null,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO public.ecom_shipments (
             ecom_order_id, carrier_name, awb_number, tracking_url, status, shipped_at, notes
           )
           VALUES ($1, $2, $3, $4, 'IN_TRANSIT', CURRENT_TIMESTAMP, $5)`,
          [
            order.id,
            carrierName || "Internal Courier",
            awbNumber || null,
            trackingUrl || null,
            message || null,
          ],
        );
      }
    } else if (status === "DELIVERED") {
      if (existingShipment) {
        await client.query(
          `UPDATE public.ecom_shipments
           SET status = 'DELIVERED',
               delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
               notes = COALESCE($2, notes),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [existingShipment.id, message || null],
        );
      } else {
        await client.query(
          `INSERT INTO public.ecom_shipments (
             ecom_order_id, carrier_name, awb_number, tracking_url, status, shipped_at, delivered_at, notes
           )
           VALUES ($1, $2, $3, $4, 'DELIVERED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5)`,
          [
            order.id,
            carrierName || "Internal Courier",
            awbNumber || null,
            trackingUrl || null,
            message || "Order delivered.",
          ],
        );
      }
    } else if (status === "FAILED") {
      if (existingShipment) {
        await client.query(
          `UPDATE public.ecom_shipments
           SET status = 'FAILED',
               notes = COALESCE($2, notes),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [existingShipment.id, message || null],
        );
      } else {
        await client.query(
          `INSERT INTO public.ecom_shipments (
             ecom_order_id, carrier_name, awb_number, tracking_url, status, notes
           )
           VALUES ($1, $2, $3, $4, 'FAILED', $5)`,
          [
            order.id,
            carrierName || "Internal Courier",
            awbNumber || null,
            trackingUrl || null,
            message || "Order delivery failed.",
          ],
        );
      }
    }
  }

  // 6. Audit logging
  await client.query(
    `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
     VALUES ($1, 'UPDATE_STATUS', 'ORDER_REQUEST', $2, $3::jsonb, $4::jsonb)`,
    [
      staffEmail,
      order.order_number,
      JSON.stringify({ status: order.status, payment_status: order.payment_status }),
      JSON.stringify({
        status,
        payment_status: order.payment_status,
        message,
        trackingUrl,
        carrierName,
        awbNumber,
        requiresManualRefund,
      }),
    ],
  );

  // 7. Enqueue notifications
  const notificationType =
    status === "SHIPPED" || status === "IN_TRANSIT"
      ? "DISPATCH"
      : status === "DELIVERED"
        ? "DELIVERY"
        : status === "CANCELLED" || status === "REJECTED"
          ? "CANCELLATION"
          : null;

  if (notificationType) {
    await enqueueOrderNotification(client as any, {
      eventKey: `order-status:${order.id}:${status}`,
      eventType: notificationType,
      orderId: order.id,
      orderNumber: order.order_number,
      email: order.billing_address_snapshot?.email,
      phone: order.billing_address_snapshot?.phone,
      customerName: order.billing_address_snapshot?.contactPerson,
      message: message || `Your order ${order.order_number} status is now ${status.toLowerCase()}. Contact support if you need assistance.`,
      status,
      trackingUrl,
    });
  }

  return {
    success: true,
    orderNumber: order.order_number,
    status,
    paymentStatus: order.payment_status,
    carrierName: shipmentCarrier,
    awbNumber: shipmentAwb,
    trackingUrl: shipmentTrackingUrl,
    requiresManualRefund,
  };
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (session.user.role !== "staff") {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam === null ? 50 : Number(limitParam);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: "Limit must be an integer between 1 and 100." }, { status: 400 });
  }

  try {
    const result = await ecommerceQuery<{
      order_number: string;
      status: string;
      payment_status: string;
      currency: string;
      total_amount: string | number;
      billing_address_snapshot: Record<string, unknown>;
      shipping_address_snapshot: Record<string, unknown>;
      created_at: string | Date;
    }>(
      `SELECT order_number, status, payment_status, currency, total_amount,
              billing_address_snapshot, shipping_address_snapshot, created_at
       FROM public.ecom_orders
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    return NextResponse.json(
      { orders: result.rows },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not load staff order queue:", error);
    return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (session.user.role !== "staff" || !session.user.email) {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!input || typeof input !== "object" || !("orderNumber" in input) ||
    typeof input.orderNumber !== "string" || !("status" in input) ||
    typeof input.status !== "string" || !Object.values(ORDER_TRANSITIONS).some((statuses) => statuses.includes(input.status as string))) {
    return NextResponse.json({ error: "Provide an order number and supported next status." }, { status: 400 });
  }

  const message = "message" in input && typeof input.message === "string" ? input.message.trim() : "";
  const trackingUrl = "trackingUrl" in input && typeof input.trackingUrl === "string" ? input.trackingUrl.trim() : "";
  const carrierName = "carrierName" in input && typeof input.carrierName === "string" ? input.carrierName.trim() : "";
  const awbNumber = "awbNumber" in input && typeof input.awbNumber === "string" ? input.awbNumber.trim() : "";

  if (message.length > 1000 || trackingUrl.length > 1000) {
    return NextResponse.json({ error: "Fulfilment details are too long." }, { status: 400 });
  }
  if (trackingUrl) {
    try {
      if (new URL(trackingUrl).protocol !== "https:") throw new Error("https required");
    } catch {
      return NextResponse.json({ error: "Tracking URL must use HTTPS." }, { status: 400 });
    }
  }

  const { orderNumber, status } = input;
  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");
    const result = await processStaffOrderStatusTransition(
      {
        orderNumber,
        status,
        staffEmail: session.user.email,
        message,
        trackingUrl,
        carrierName,
        awbNumber,
      },
      client,
      query,
    );

    if (!result.success) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: result.error }, { status: result.statusCode });
    }

    await client.query("COMMIT");
    return NextResponse.json({
      orderNumber: result.orderNumber,
      status: result.status,
      carrierName: result.carrierName,
      awbNumber: result.awbNumber,
      trackingUrl: result.trackingUrl,
      paymentStatus: result.paymentStatus,
      requiresManualRefund: result.requiresManualRefund,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not update order request:", error);
    return NextResponse.json({ error: "Could not update order request." }, { status: 500 });
  } finally {
    client.release();
  }
}

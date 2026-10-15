import { getEcommerceDbPool } from "./db";

export interface LinkGuestOrdersResult {
  success: boolean;
  linkedCount: number;
  orderNumbers: string[];
  error?: string;
}

export interface LinkGuestOrdersOptions {
  email: string;
  isEmailVerified: boolean;
  customerId: string;
}

/**
 * Safely and transactionally links unassigned guest orders to a registered customer.
 * Strict security invariants:
 * 1. Requires verified email control (isEmailVerified === true).
 * 2. Matches normalized email (case-insensitive, trimmed).
 * 3. Only links orders where ecom_customer_id IS NULL.
 * 4. Never reassigns orders already owned by another customer.
 * 5. Safe, idempotent, parameterized SQL.
 */
export async function linkGuestOrdersToCustomer(
  options: LinkGuestOrdersOptions,
  client?: { query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
): Promise<LinkGuestOrdersResult> {
  const { email, isEmailVerified, customerId } = options;

  if (!isEmailVerified) {
    return {
      success: false,
      linkedCount: 0,
      orderNumbers: [],
      error: "Email must be verified to link guest orders.",
    };
  }

  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return {
      success: false,
      linkedCount: 0,
      orderNumbers: [],
      error: "A valid email address is required.",
    };
  }

  if (!customerId || typeof customerId !== "string" || !customerId.trim()) {
    return {
      success: false,
      linkedCount: 0,
      orderNumbers: [],
      error: "A valid customer identifier is required.",
    };
  }

  const executeInClient = async (dbClient: {
    query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  }): Promise<LinkGuestOrdersResult> => {
    // Transactional update: strictly only updates orders where ecom_customer_id IS NULL
    const updateResult = await dbClient.query<{ id: string; order_number: string }>(
      `UPDATE public.ecom_orders
       SET ecom_customer_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE ecom_customer_id IS NULL
         AND LOWER(billing_address_snapshot->>'email') = $2
       RETURNING id, order_number`,
      [customerId, normalizedEmail],
    );

    const linkedOrders = updateResult.rows || [];
    const orderNumbers = linkedOrders.map((o) => o.order_number);

    // Audit log each linked order
    for (const order of linkedOrders) {
      await dbClient.query(
        `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
         VALUES ($1, 'LINK_GUEST_ORDER', 'ORDER', $2, $3::jsonb, $4::jsonb)`,
        [
          normalizedEmail,
          order.order_number,
          JSON.stringify({ ecom_customer_id: null }),
          JSON.stringify({ ecom_customer_id: customerId }),
        ],
      );
    }

    return {
      success: true,
      linkedCount: linkedOrders.length,
      orderNumbers,
    };
  };

  if (client) {
    return executeInClient(client);
  }

  const poolClient = await getEcommerceDbPool().connect();
  try {
    await poolClient.query("BEGIN");
    const result = await executeInClient(poolClient);
    await poolClient.query("COMMIT");
    return result;
  } catch (error) {
    await poolClient.query("ROLLBACK").catch(() => undefined);
    console.error("Error linking guest orders:", error);
    return {
      success: false,
      linkedCount: 0,
      orderNumbers: [],
      error: "Could not link guest orders.",
    };
  } finally {
    poolClient.release();
  }
}

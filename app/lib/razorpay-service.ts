import crypto from "crypto";
import type { PoolClient } from "pg";

export interface RazorpayPaymentDetails {
  id: string;
  entity: string;
  amount: number | string;
  currency: string;
  status: string;
  order_id: string;
  invoice_id?: string | null;
  international?: boolean;
  method?: string;
  amount_refunded?: number;
  refund_status?: string | null;
  captured?: boolean;
  description?: string;
  card_id?: string | null;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  email?: string;
  contact?: string;
  created_at?: number;
}

/**
 * Returns true ONLY if explicitly running in development or test environment
 * AND the developer has set ENABLE_PAYMENT_SIMULATION=true.
 * In production or staging, this always returns false.
 */
export function isPaymentSimulationAllowed(): boolean {
  const isDevOrTest =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  return (
    isDevOrTest &&
    process.env.ENABLE_PAYMENT_SIMULATION === "true"
  );
}

/**
 * Verifies Razorpay HMAC SHA-256 signature for client checkout verification.
 * Fails closed if the secret is missing or empty.
 */
export function verifyPaymentSignature(options: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  secret?: string;
}): { valid: boolean; error?: string } {
  const secret = options.secret !== undefined ? options.secret : process.env.RAZORPAY_KEY_SECRET;

  if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
    return {
      valid: false,
      error: "Razorpay key secret is not configured. Signature validation failed closed.",
    };
  }

  if (
    !options.razorpayOrderId ||
    !options.razorpayOrderId.trim() ||
    !options.razorpayPaymentId ||
    !options.razorpayPaymentId.trim() ||
    !options.razorpaySignature ||
    !options.razorpaySignature.trim()
  ) {
    return {
      valid: false,
      error: "Missing parameters required for signature verification.",
    };
  }

  try {
    const payload = `${options.razorpayOrderId.trim()}|${options.razorpayPaymentId.trim()}`;
    const generatedSignature = crypto
      .createHmac("sha256", secret.trim())
      .update(payload)
      .digest("hex");

    const expectedBuffer = Buffer.from(generatedSignature, "utf8");
    const actualBuffer = Buffer.from(options.razorpaySignature.trim(), "utf8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, error: "Signature length mismatch." };
    }

    const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    if (!isValid) {
      return { valid: false, error: "Payment verification signature mismatch." };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Verifies Razorpay Webhook HMAC SHA-256 signature.
 * Fails closed if the webhook secret is missing.
 */
export function verifyWebhookSignature(options: {
  rawBody: string;
  signature: string;
  webhookSecret?: string;
}): { valid: boolean; error?: string } {
  const secret = options.webhookSecret !== undefined ? options.webhookSecret : process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
    return {
      valid: false,
      error: "Razorpay webhook secret is not configured. Webhook validation failed closed.",
    };
  }

  if (
    !options.rawBody ||
    typeof options.rawBody !== "string" ||
    !options.signature ||
    !options.signature.trim()
  ) {
    return {
      valid: false,
      error: "Missing body or signature for webhook verification.",
    };
  }

  try {
    const generatedSignature = crypto
      .createHmac("sha256", secret.trim())
      .update(options.rawBody)
      .digest("hex");

    const expectedBuffer = Buffer.from(generatedSignature, "utf8");
    const actualBuffer = Buffer.from(options.signature.trim(), "utf8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, error: "Webhook signature length mismatch." };
    }

    const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    if (!isValid) {
      return { valid: false, error: "Webhook signature mismatch." };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Server-side payment verification via Razorpay REST API.
 * Validates order ID, amount (paise), currency INR, and captured status.
 */
export async function fetchAndVerifyServerPayment(options: {
  paymentId: string;
  expectedOrderId: string;
  expectedAmountPaise: number;
  expectedCurrency: string;
  keyId?: string;
  keySecret?: string;
  fetchFn?: typeof fetch;
}): Promise<{ valid: boolean; payment?: RazorpayPaymentDetails; error?: string }> {
  const keyId = options.keyId !== undefined ? options.keyId : process.env.RAZORPAY_KEY_ID;
  const keySecret = options.keySecret !== undefined ? options.keySecret : process.env.RAZORPAY_KEY_SECRET;

  if (
    !keyId ||
    !keySecret ||
    typeof keyId !== "string" ||
    typeof keySecret !== "string" ||
    keyId.trim().length === 0 ||
    keySecret.trim().length === 0
  ) {
    return {
      valid: false,
      error: "Razorpay API credentials are not configured on the server. Failing closed.",
    };
  }

  if (!options.paymentId || !options.paymentId.trim()) {
    return {
      valid: false,
      error: "paymentId is required for server payment verification.",
    };
  }

  if (options.expectedCurrency.toUpperCase() !== "INR") {
    return {
      valid: false,
      error: `Expected currency must be INR, received ${options.expectedCurrency}.`,
    };
  }

  const fetcher = options.fetchFn ?? fetch;
  const basicAuth = Buffer.from(`${keyId.trim()}:${keySecret.trim()}`).toString("base64");

  try {
    const url = `https://api.razorpay.com/v1/payments/${encodeURIComponent(options.paymentId.trim())}`;
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `Razorpay API fetch failed with status ${response.status}.`,
      };
    }

    const payment: RazorpayPaymentDetails = await response.json();

    // 1. Order ID match
    if (!payment.order_id || payment.order_id !== options.expectedOrderId) {
      return {
        valid: false,
        error: `Payment order ID mismatch. Expected ${options.expectedOrderId}, received ${payment.order_id}.`,
      };
    }

    // 2. Amount match (exact paise)
    const paidPaise = Math.round(Number(payment.amount));
    if (!Number.isFinite(paidPaise) || paidPaise <= 0 || paidPaise !== options.expectedAmountPaise) {
      return {
        valid: false,
        error: `Payment amount mismatch. Expected ${options.expectedAmountPaise} paise, received ${paidPaise} paise.`,
      };
    }

    // 3. Currency match (must be INR)
    if (!payment.currency || payment.currency.toUpperCase() !== "INR") {
      return {
        valid: false,
        error: `Payment currency mismatch. Expected INR, received ${payment.currency}.`,
      };
    }

    // 4. Status match
    const normalizedStatus = payment.status?.toLowerCase();
    if (normalizedStatus !== "captured" && normalizedStatus !== "authorized") {
      return {
        valid: false,
        error: `Payment status invalid. Expected captured/authorized, received ${payment.status}.`,
      };
    }

    // 5. Captured flag check where status is captured
    if (normalizedStatus === "captured" && payment.captured === false) {
      return {
        valid: false,
        error: "Payment status is captured but captured flag is false.",
      };
    }

    return { valid: true, payment };
  } catch (err) {
    return {
      valid: false,
      error: `Could not connect to Razorpay API: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Validates that the requesting caller is the legitimate owner of the order.
 * Accepts authenticated session match OR verification against billing snapshot email/phone for guest orders.
 * Prevents registered account orders from being claimed or initialized by unauthenticated callers.
 */
export function isOrderAuthorized(options: {
  billingSnapshot: { email?: string; phone?: string } | null;
  sessionEmail?: string | null;
  isStaff?: boolean;
  customerEmail?: string | null;
  customerPhone?: string | null;
  orderCustomerId?: string | null;
}): boolean {
  if (options.isStaff) return true;

  const snapshotEmail = options.billingSnapshot?.email?.trim().toLowerCase();
  const snapshotPhone = options.billingSnapshot?.phone?.trim();

  // If session is logged in, email must strictly match snapshot email
  if (options.sessionEmail) {
    return Boolean(snapshotEmail && options.sessionEmail.trim().toLowerCase() === snapshotEmail);
  }

  // If order was created by a registered user, unauthenticated callers cannot claim it
  if (options.orderCustomerId) {
    return false;
  }

  // Guest checkout: customer provided matching email
  if (options.customerEmail && snapshotEmail && options.customerEmail.trim().toLowerCase() === snapshotEmail) {
    return true;
  }

  // Guest checkout: customer provided matching phone
  if (options.customerPhone && snapshotPhone && options.customerPhone.trim() === snapshotPhone) {
    return true;
  }

  return false;
}

export interface TransactionProcessResult {
  success: boolean;
  alreadyPaid?: boolean;
  holdExpired?: boolean;
  status: string;
  paymentStatus: string;
  paymentId: string;
  error?: string;
}

/**
 * Atomically processes payment confirmation within a database transaction.
 * Commits active reservations if the hold is still valid.
 * If the hold has expired, DOES NOT oversell stock; records PAYMENT_REVIEW for reconciliation/refund.
 */
export async function processPaymentConfirmationTransaction(options: {
  client: PoolClient;
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  paymentId: string;
  signature: string;
  method: string;
  isSimulated: boolean;
}): Promise<TransactionProcessResult> {
  const { client, orderId, orderNumber, razorpayOrderId, paymentId, signature, method, isSimulated } = options;

  // 1. Lock the order row
  const orderRes = await client.query<{
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    total_amount: string | number;
    notes: string | null;
  }>(
    `SELECT id, order_number, status, payment_status, total_amount, notes
     FROM public.ecom_orders
     WHERE id = $1 FOR UPDATE`,
    [orderId],
  );

  const order = orderRes.rows[0];
  if (!order) {
    throw new Error(`Order ${orderId} not found during payment processing.`);
  }

  // 2. Idempotency guard: If already paid, return early
  if (order.payment_status === "PAID") {
    return {
      success: true,
      alreadyPaid: true,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentId,
    };
  }

  // 3. Check for active inventory reservation holds vs total order items
  const itemsCountRes = await client.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM public.ecom_order_items WHERE ecom_order_id = $1`,
    [orderId],
  );
  const totalItemCount = Number(itemsCountRes.rows[0]?.count || 0);

  const holdsRes = await client.query<{
    id: string;
    product_id: string;
    quantity: number;
    expires_at: Date;
  }>(
    `SELECT id, product_id, quantity, expires_at
     FROM public.ecom_inventory_reservations
     WHERE order_id = $1 AND status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP
     FOR UPDATE`,
    [orderId],
  );

  // If all items still have active holds (or if there are active holds matching expected items)
  const hasValidHold = totalItemCount > 0
    ? holdsRes.rows.length === totalItemCount
    : holdsRes.rows.length > 0;

  if (hasValidHold) {
    // A. Normal flow: Commit active holds and confirm order
    await client.query(
      `UPDATE public.ecom_inventory_reservations
       SET status = 'COMMITTED', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP`,
      [orderId],
    );

    // Safely deduct from ecom_product_catalog.stock_override if set
    for (const hold of holdsRes.rows) {
      await client.query(
        `UPDATE public.ecom_product_catalog
         SET stock_override = GREATEST(0, stock_override - $2),
             updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1 AND stock_override IS NOT NULL`,
        [hold.product_id, hold.quantity],
      );
    }

    // Update payment record in ecom_payments scoped to both razorpay_order_id and order_id
    await client.query(
      `UPDATE public.ecom_payments
       SET razorpay_payment_id = $2,
           razorpay_signature = $3,
           status = 'CAPTURED',
           method = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE razorpay_order_id = $1 AND ecom_order_id = $5`,
      [razorpayOrderId, paymentId, signature, method, orderId],
    );

    // Update order status to CONFIRMED and PAID
    await client.query(
      `UPDATE public.ecom_orders
       SET status = 'CONFIRMED',
           payment_status = 'PAID',
           payment_method = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId, isSimulated ? "UPI_QR_TEST" : "RAZORPAY"],
    );

    // Audit log
    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
       VALUES ($1, 'PAYMENT_CONFIRMED', 'ORDER', $2, $3::jsonb, $4::jsonb)`,
      [
        "system:payment_verifier",
        orderNumber,
        JSON.stringify({ status: order.status, payment_status: order.payment_status }),
        JSON.stringify({
          status: "CONFIRMED",
          payment_status: "PAID",
          razorpayOrderId,
          paymentId,
          isSimulated,
        }),
      ],
    );

    return {
      success: true,
      status: "CONFIRMED",
      paymentStatus: "PAID",
      paymentId,
    };
  } else {
    // B. Late payment handling: Hold expired/released!
    // Do NOT confirm order or oversell stock. Place in PAYMENT_REVIEW.
    const warningNote = (order.notes ? order.notes + " " : "") +
      "[WARNING: Payment received after 10-minute hold expired. Flagged for inventory reconciliation or refund.]";

    await client.query(
      `UPDATE public.ecom_payments
       SET razorpay_payment_id = $2,
           razorpay_signature = $3,
           status = 'CAPTURED',
           method = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE razorpay_order_id = $1 AND ecom_order_id = $5`,
      [razorpayOrderId, paymentId, signature, method, orderId],
    );

    await client.query(
      `UPDATE public.ecom_orders
       SET status = 'PAYMENT_REVIEW',
           payment_status = 'PAID',
           payment_method = $2,
           notes = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId, isSimulated ? "UPI_QR_TEST" : "RAZORPAY", warningNote],
    );

    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
       VALUES ($1, 'PAYMENT_HOLD_EXPIRED', 'ORDER', $2, $3::jsonb, $4::jsonb)`,
      [
        "system:payment_verifier",
        orderNumber,
        JSON.stringify({ status: order.status, payment_status: order.payment_status }),
        JSON.stringify({
          status: "PAYMENT_REVIEW",
          payment_status: "PAID",
          reason: "HOLD_EXPIRED",
          requiresReconciliationOrRefund: true,
          razorpayOrderId,
          paymentId,
          isSimulated,
        }),
      ],
    );

    return {
      success: false,
      holdExpired: true,
      status: "PAYMENT_REVIEW",
      paymentStatus: "PAID",
      paymentId,
      error: "Payment was captured, but the 10-minute inventory reservation expired. Order flagged for priority review or refund.",
    };
  }
}

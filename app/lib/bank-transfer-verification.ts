import type { PoolClient } from "pg";
import { processPaymentConfirmationTransaction } from "./razorpay-service";
import { BANK_TRANSFER_GATEWAY, BANK_TRANSFER_METHOD } from "./bank-transfer-service";

/**
 * Staff bank-transfer verification transaction.
 * Must be called inside an open database transaction with a staff session
 * already validated by the API route. Verifies the pending transfer record
 * and atomically confirms the order (same confirmation path as Razorpay).
 */
export async function verifyBankTransferTransaction(options: {
  client: PoolClient;
  orderNumber: string;
  utr: string;
  staffEmail: string;
  action: "confirm" | "reject";
  notes?: string;
}): Promise<{
  success: boolean;
  statusCode: number;
  error?: string;
  status?: string;
  paymentStatus?: string;
  holdExpired?: boolean;
}> {
  const { client, orderNumber, staffEmail } = options;
  const utr = options.utr.trim().toUpperCase();

  // 1. Lock the order
  const orderRes = await client.query<{
    id: string;
    status: string;
    payment_status: string;
    total_amount: string | number;
  }>(
    `SELECT id, status, payment_status, total_amount
     FROM public.ecom_orders
     WHERE order_number = $1 FOR UPDATE`,
    [orderNumber],
  );
  const order = orderRes.rows[0];
  if (!order) return { success: false, statusCode: 404, error: "Order not found." };

  // 2. Only pending payment orders can be verified
  if (["CONFIRMED", "PROCESSING", "PACKAGED", "IN_TRANSIT", "SHIPPED", "DELIVERED", "CANCELLED", "REJECTED"].includes(order.status)) {
    return { success: false, statusCode: 409, error: `Order with status ${order.status} cannot be verified.` };
  }

  // 3. Find the pending bank-transfer payment record
  const paymentRes = await client.query<{
    id: string;
    amount: string | number;
    currency: string;
    status: string;
    method: string | null;
  }>(
    `SELECT id, amount, currency, status, method
     FROM public.ecom_payments
     WHERE ecom_order_id = $1 AND gateway = $2
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [order.id, BANK_TRANSFER_GATEWAY],
  );
  const payment = paymentRes.rows[0];
  if (!payment) {
    return { success: false, statusCode: 404, error: "No bank transfer payment record exists for this order." };
  }

  if (options.action === "reject") {
    await client.query(
      `UPDATE public.ecom_payments
       SET status = 'FAILED', method = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [payment.id, BANK_TRANSFER_METHOD],
    );
    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
       VALUES ($1, 'BANK_TRANSFER_REJECTED', 'ORDER', $2, $3::jsonb, $4::jsonb)`,
      [
        staffEmail,
        orderNumber,
        JSON.stringify({ status: order.status, payment_status: order.payment_status }),
        JSON.stringify({ utr, note: options.notes || "" }),
      ],
    );
    return { success: true, statusCode: 200, status: order.status, paymentStatus: order.payment_status };
  }

  // 4. UTR must be recorded on the pending payment
  const recordedUtr = await client.query<{ utr_reference: string | null }>(
    "SELECT utr_reference FROM public.ecom_payments WHERE id = $1",
    [payment.id],
  );
  if (recordedUtr.rows[0]?.utr_reference !== utr) {
    return { success: false, statusCode: 400, error: "UTR does not match the pending bank transfer record." };
  }

  if (payment.status === "CAPTURED") {
    return { success: false, statusCode: 409, error: "Bank transfer is already verified." };
  }
  if (payment.status !== "PENDING_VERIFICATION") {
    return { success: false, statusCode: 409, error: `Bank transfer has status ${payment.status}; cannot verify.` };
  }

  // 5. Shared confirmation transaction (commits holds, marks PAID/CONFIRMED)
  const processResult = await processPaymentConfirmationTransaction({
    client,
    orderId: order.id,
    orderNumber,
    razorpayOrderId: await getTransferReference(client, payment.id),
    paymentId: utr,
    signature: `staff-verified:${staffEmail}`,
    method: BANK_TRANSFER_METHOD,
    isSimulated: false,
  });

  if (processResult.holdExpired) {
    return {
      success: false,
      holdExpired: true,
      statusCode: 409,
      status: processResult.status,
      paymentStatus: processResult.paymentStatus,
      error: processResult.error,
    };
  }

  await client.query(
    `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
     VALUES ($1, 'BANK_TRANSFER_VERIFIED', 'ORDER', $2, $3::jsonb, $4::jsonb)`,
    [
      staffEmail,
      orderNumber,
      JSON.stringify({ status: order.status, payment_status: order.payment_status }),
      JSON.stringify({ utr, confirmed: true }),
    ],
  );

  return {
    success: true,
    statusCode: 200,
    status: processResult.status,
    paymentStatus: processResult.paymentStatus,
  };
}

async function getTransferReference(client: PoolClient, paymentId: string): Promise<string> {
  const res = await client.query<{ razorpay_order_id: string }>(
    "SELECT razorpay_order_id FROM public.ecom_payments WHERE id = $1",
    [paymentId],
  );
  return res.rows[0]?.razorpay_order_id ?? `BTRF-UNKNOWN-${paymentId}`;
}

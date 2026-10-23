import { NextResponse, type NextRequest } from "next/server";
import { getEcommerceDbPool } from "@/app/lib/db";
import { auth } from "@/auth";
import { isOrderAuthorized } from "@/app/lib/razorpay-service";
import {
  BANK_TRANSFER_GATEWAY,
  BANK_TRANSFER_WINDOW_MINUTES,
  computeBankTransferChecksum,
  generateTransferReference,
  getCompanyBankAccount,
} from "@/app/lib/bank-transfer-service";

/**
 * POST /api/checkout/bank-transfer/order
 * Creates (or returns the existing) bank-transfer payment record for an order
 * and returns the company bank account details the customer should pay to.
 * Does NOT mark anything paid — confirmation only happens after staff verify
 * the customer's UTR against the bank statement.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("orderNumber" in body)) {
    return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });
  }

  const { orderNumber, customerEmail, customerPhone } = body as {
    orderNumber?: string;
    customerEmail?: string;
    customerPhone?: string;
  };
  const trimmedOrderNumber = orderNumber?.trim();
  if (!trimmedOrderNumber) {
    return NextResponse.json({ error: "orderNumber cannot be empty." }, { status: 400 });
  }

  const bankAccount = getCompanyBankAccount();
  if (!bankAccount) {
    return NextResponse.json(
      { error: "Bank transfer is not configured on the server. Please use another payment method." },
      { status: 503 },
    );
  }

  const session = await auth();
  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query<{
      id: string;
      order_number: string;
      total_amount: string | number;
      currency: string;
      payment_status: string;
      status: string;
      billing_address_snapshot: { email?: string; phone?: string } | null;
      ecom_customer_id: string | null;
    }>(
      `SELECT id, order_number, total_amount, currency, payment_status, status,
              billing_address_snapshot, ecom_customer_id
       FROM public.ecom_orders
       WHERE order_number = $1 FOR UPDATE`,
      [trimmedOrderNumber],
    );
    const order = orderRes.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const authorized = isOrderAuthorized({
      billingSnapshot: order.billing_address_snapshot,
      sessionEmail: session?.user?.email,
      isStaff: session?.user?.role === "staff",
      customerEmail,
      customerPhone,
      orderCustomerId: order.ecom_customer_id,
    });
    if (!authorized) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "You are not authorized to pay for this order." }, { status: 403 });
    }

    if (order.payment_status === "PAID") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order is already paid." }, { status: 409 });
    }
    if (!["PENDING", "IN_REVIEW"].includes(order.status)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `Payment cannot be initiated for an order with status: ${order.status}.` },
        { status: 409 },
      );
    }
    if (order.currency !== "INR") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Orders must use INR currency, found ${order.currency}.` }, { status: 400 });
    }

    // Inventory hold must still be alive
    const holdRes = await client.query<{ id: string; expires_at: Date }>(
      `SELECT id, expires_at
       FROM public.ecom_inventory_reservations
       WHERE order_id = $1 AND status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP
       ORDER BY expires_at ASC
       LIMIT 1`,
      [order.id],
    );
    if (holdRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: "The 10-minute inventory reservation for this order has expired. Please create a new order.",
          code: "HOLD_EXPIRED",
        },
        { status: 410 },
      );
    }
    const holdExpiresAt = holdRes.rows[0].expires_at;
    const totalAmount = Number(order.total_amount);

    // Reuse an existing bank-transfer record or create one
    const existing = await client.query<{ razorpay_order_id: string }>(
      `SELECT razorpay_order_id
       FROM public.ecom_payments
       WHERE ecom_order_id = $1 AND gateway = $2
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [order.id, BANK_TRANSFER_GATEWAY],
    );

    let transferReference: string;
    if (existing.rows.length > 0) {
      transferReference = existing.rows[0].razorpay_order_id;
    } else {
      transferReference = generateTransferReference(order.order_number);
      await client.query(
        `INSERT INTO public.ecom_payments (
           ecom_order_id, gateway, razorpay_order_id, amount, currency, status, method
         )
         VALUES ($1, $2, $3, $4, $5, 'CREATED', 'BANK_TRANSFER')`,
        [order.id, BANK_TRANSFER_GATEWAY, transferReference, totalAmount, order.currency],
      );
    }

    await client.query("COMMIT");

    // Checksum for the UTR submission form (computed server-side over the
    // exact amount on file so the client cannot alter it).
    const tokenResult = computeBankTransferChecksum({
      orderNumber: order.order_number,
      amountInPaise: Math.round(totalAmount * 100),
    });
    if (!tokenResult.valid) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: tokenResult.error }, { status: 500 });
    }

    return NextResponse.json({
      transferReference,
      amount: totalAmount,
      currency: order.currency,
      orderNumber: order.order_number,
      bankAccount,
      submissionToken: tokenResult.token,
      expiresAt: holdExpiresAt.toISOString(),
      paymentWindowMinutes: BANK_TRANSFER_WINDOW_MINUTES,
      note: "After making the transfer, submit the UTR / reference number. Your order is confirmed only after our staff verify the payment.",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not create bank transfer payment:", error);
    return NextResponse.json({ error: "Could not create bank transfer payment." }, { status: 500 });
  } finally {
    client.release();
  }
}

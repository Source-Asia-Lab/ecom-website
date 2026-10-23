import { NextResponse, type NextRequest } from "next/server";
import { getEcommerceDbPool } from "@/app/lib/db";
import { auth } from "@/auth";
import { isOrderAuthorized } from "@/app/lib/razorpay-service";
import {
  BANK_TRANSFER_GATEWAY,
  isValidUtr,
  verifyBankTransferChecksum,
} from "@/app/lib/bank-transfer-service";

/**
 * POST /api/checkout/bank-transfer/submit
 * Customer submits the UTR (12-character bank reference) for their transfer.
 * Stores it as PENDING_VERIFICATION. The order is NOT confirmed here —
 * authorized staff must verify the UTR against the bank statement.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Submission payload required." }, { status: 400 });
  }

  const {
    orderNumber,
    transferReference,
    utr,
    checksum,
    customerEmail,
    customerPhone,
  } = body as {
    orderNumber?: string;
    transferReference?: string;
    utr?: string;
    checksum?: string;
    customerEmail?: string;
    customerPhone?: string;
  };

  const trimmedOrderNumber = orderNumber?.trim();
  const trimmedReference = transferReference?.trim();
  const trimmedUtr = utr?.trim().toUpperCase();

  if (!trimmedOrderNumber || !trimmedReference) {
    return NextResponse.json({ error: "Order details (orderNumber, transferReference) are missing." }, { status: 400 });
  }
  if (!trimmedUtr) {
    return NextResponse.json({ error: "UTR / transaction reference number is required." }, { status: 400 });
  }
  if (!isValidUtr(trimmedUtr)) {
    return NextResponse.json(
      { error: "UTR must be exactly 12 letters/numbers (as printed on your bank receipt)." },
      { status: 400 },
    );
  }
  if (!checksum) {
    return NextResponse.json({ error: "Checksum is required for UTR submission." }, { status: 400 });
  }

  const session = await auth();
  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query<{
      id: string;
      order_number: string;
      total_amount: string | number;
      status: string;
      payment_status: string;
      billing_address_snapshot: { email?: string; phone?: string } | null;
      ecom_customer_id: string | null;
    }>(
      `SELECT id, order_number, total_amount, status, payment_status,
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
      return NextResponse.json({ error: "You are not authorized to submit payment for this order." }, { status: 403 });
    }

    if (order.payment_status === "PAID") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order is already paid." }, { status: 409 });
    }

    const paymentRes = await client.query<{
      id: string;
      amount: string | number;
      currency: string;
      status: string;
    }>(
      `SELECT id, amount, currency, status
       FROM public.ecom_payments
       WHERE ecom_order_id = $1 AND razorpay_order_id = $2 AND gateway = $3
       FOR UPDATE`,
      [order.id, trimmedReference, BANK_TRANSFER_GATEWAY],
    );
    const payment = paymentRes.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "The provided transfer reference is not associated with this order." },
        { status: 400 },
      );
    }

    if (payment.status === "PENDING_VERIFICATION") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "A UTR has already been submitted for this order and is awaiting verification." },
        { status: 409 },
      );
    }
    if (payment.status !== "CREATED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Transfer has status ${payment.status}; cannot submit UTR.` }, { status: 409 });
    }

    // Integrity token over (orderNumber|amountInPaise) — issued with the bank details
    const checksumCheck = verifyBankTransferChecksum({
      orderNumber: trimmedOrderNumber,
      amountInPaise: Math.round(Number(payment.amount) * 100),
      token: checksum,
    });
    if (!checksumCheck.valid) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: checksumCheck.error || "Checksum verification failed." }, { status: 400 });
    }

    // Record UTR. Unique index guarantees one UTR per payment record and
    // that the same UTR cannot be attached to two different payments.
    try {
      await client.query(
        `UPDATE public.ecom_payments
         SET utr_reference = $2, status = 'PENDING_VERIFICATION', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [payment.id, trimmedUtr],
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505" || code === "23P01") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "This UTR has already been submitted for a different payment. Please check and re-enter." },
          { status: 409 },
        );
      }
      throw err;
    }

    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
       VALUES ($1, 'BANK_TRANSFER_UTR_SUBMITTED', 'ORDER', $2, $3::jsonb, $4::jsonb)`,
      [
        session?.user?.email || `guest:${order.billing_address_snapshot?.email || "unknown"}`,
        order.order_number,
        JSON.stringify({ payment_status: order.payment_status, transfer_status: payment.status }),
        JSON.stringify({ transferReference: trimmedReference, utr: trimmedUtr }),
      ],
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      transferReference: trimmedReference,
      utr: trimmedUtr,
      status: "PENDING_VERIFICATION",
      note: "UTR received. Your order will be confirmed after staff verify the payment (usually within 1 business day).",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not submit bank transfer UTR:", error);
    return NextResponse.json({ error: "Could not submit UTR. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}

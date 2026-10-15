import { NextResponse, type NextRequest } from "next/server";
import { getEcommerceDbPool } from "@/app/lib/db";
import { auth } from "@/auth";
import {
  isOrderAuthorized,
  isPaymentSimulationAllowed,
  verifyPaymentSignature,
  fetchAndVerifyServerPayment,
  processPaymentConfirmationTransaction,
} from "@/app/lib/razorpay-service";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Verification payload required." }, { status: 400 });
  }

  const {
    orderNumber,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    customerEmail,
    customerPhone,
    isSimulated = false,
  } = body as {
    orderNumber?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    customerEmail?: string;
    customerPhone?: string;
    isSimulated?: boolean;
  };

  const trimmedOrderNumber = orderNumber?.trim();
  const trimmedRzpOrderId = razorpayOrderId?.trim();

  if (!trimmedOrderNumber || !trimmedRzpOrderId) {
    return NextResponse.json({ error: "Order details (orderNumber, razorpayOrderId) are missing." }, { status: 400 });
  }

  const session = await auth();
  const client = await getEcommerceDbPool().connect();

  try {
    await client.query("BEGIN");

    // 1. Fetch order details with row lock
    const orderRes = await client.query<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      total_amount: string | number;
      currency: string;
      billing_address_snapshot: { email?: string; phone?: string } | null;
      ecom_customer_id: string | null;
    }>(
      `SELECT id, order_number, status, payment_status, total_amount, currency, billing_address_snapshot, ecom_customer_id
       FROM public.ecom_orders
       WHERE order_number = $1 FOR UPDATE`,
      [trimmedOrderNumber],
    );

    const order = orderRes.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    // 2. Order ownership check
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
      return NextResponse.json(
        { error: "You are not authorized to verify payment for this order." },
        { status: 403 },
      );
    }

    // 3. Currency check
    if (order.currency !== "INR") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `Orders must use INR currency, found ${order.currency}.` },
        { status: 400 },
      );
    }

    // 4. Idempotency: If already paid, return early
    if (order.payment_status === "PAID") {
      await client.query("ROLLBACK");
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        orderNumber: order.order_number,
        status: order.status,
        paymentStatus: order.payment_status,
      });
    }

    // 5. Association check: Verify razorpayOrderId is associated with this local order
    const paymentRecordRes = await client.query<{
      id: string;
      amount: string | number;
      currency: string;
      status: string;
    }>(
      `SELECT id, amount, currency, status
       FROM public.ecom_payments
       WHERE ecom_order_id = $1 AND razorpay_order_id = $2
       FOR UPDATE`,
      [order.id, trimmedRzpOrderId],
    );

    if (paymentRecordRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "The provided payment order ID is not associated with this order." },
        { status: 400 },
      );
    }

    // 6. Handle Simulated Mode vs Live Verification
    let finalPaymentId: string;
    let finalSignature: string;
    let paymentMethod: string;

    if (isSimulated) {
      // Security Check: Simulation MUST NOT be accepted outside explicitly configured development mode
      if (!isPaymentSimulationAllowed()) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Payment simulation is disabled in this environment." },
          { status: 403 },
        );
      }

      finalPaymentId = razorpayPaymentId?.trim() || `pay_sim_${Date.now()}`;
      finalSignature = razorpaySignature?.trim() || `sig_sim_${Date.now()}`;
      paymentMethod = "UPI_SIMULATED_QR";
    } else {
      // Live/Test Gateway verification: Require paymentId and signature
      if (!razorpayPaymentId?.trim() || !razorpaySignature?.trim()) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Both razorpayPaymentId and razorpaySignature are required for payment verification." },
          { status: 400 },
        );
      }

      finalPaymentId = razorpayPaymentId.trim();
      finalSignature = razorpaySignature.trim();
      paymentMethod = "RAZORPAY";

      // A. HMAC SHA-256 Signature verification (Fails closed if secret is missing)
      const sigResult = verifyPaymentSignature({
        razorpayOrderId: trimmedRzpOrderId,
        razorpayPaymentId: finalPaymentId,
        razorpaySignature: finalSignature,
      });

      if (!sigResult.valid) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: sigResult.error || "Payment signature mismatch." }, { status: 400 });
      }

      // B. Server-side API verification with Razorpay REST API
      const expectedAmountPaise = Math.round(Number(order.total_amount) * 100);
      const serverCheck = await fetchAndVerifyServerPayment({
        paymentId: finalPaymentId,
        expectedOrderId: trimmedRzpOrderId,
        expectedAmountPaise,
        expectedCurrency: order.currency,
      });

      if (!serverCheck.valid) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: serverCheck.error || "Server-side payment verification failed." },
          { status: 400 },
        );
      }
    }

    // 5. Execute transactional status and inventory commit
    const processResult = await processPaymentConfirmationTransaction({
      client,
      orderId: order.id,
      orderNumber: order.order_number,
      razorpayOrderId: trimmedRzpOrderId,
      paymentId: finalPaymentId,
      signature: finalSignature,
      method: paymentMethod,
      isSimulated,
    });

    await client.query("COMMIT");

    if (processResult.holdExpired) {
      return NextResponse.json(
        {
          success: false,
          holdExpired: true,
          orderNumber: order.order_number,
          status: processResult.status,
          paymentStatus: processResult.paymentStatus,
          paymentId: processResult.paymentId,
          error: processResult.error,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      status: processResult.status,
      paymentStatus: processResult.paymentStatus,
      paymentId: processResult.paymentId,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not complete payment verification:", error);
    return NextResponse.json({ error: "Could not complete payment verification." }, { status: 500 });
  } finally {
    client.release();
  }
}


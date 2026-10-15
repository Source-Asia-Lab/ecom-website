import { NextResponse, type NextRequest } from "next/server";
import { getEcommerceDbPool } from "@/app/lib/db";
import { auth } from "@/auth";
import { isOrderAuthorized, isPaymentSimulationAllowed } from "@/app/lib/razorpay-service";
import crypto from "crypto";

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
      `SELECT id, order_number, total_amount, currency, payment_status, status, billing_address_snapshot, ecom_customer_id
       FROM public.ecom_orders
       WHERE order_number = $1 FOR UPDATE`,
      [trimmedOrderNumber],
    );

    const order = orderRes.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    // 1. Authorization: Ensure requester owns or is permitted to pay for this order
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
        { error: "You are not authorized to initialize payment for this order." },
        { status: 403 },
      );
    }

    // 2. Status checks
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
      return NextResponse.json(
        { error: `Orders must use INR currency, found ${order.currency}.` },
        { status: 400 },
      );
    }

    // 3. Inventory Hold Check: Ensure hold has NOT expired
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
    const amountInPaise = Math.round(totalAmount * 100);

    // 4. Check for existing payment order record
    const existingPayment = await client.query<{ razorpay_order_id: string }>(
      `SELECT razorpay_order_id
       FROM public.ecom_payments
       WHERE ecom_order_id = $1 AND status = 'CREATED'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [order.id],
    );

    let razorpayOrderId: string;
    if (existingPayment.rows.length > 0) {
      razorpayOrderId = existingPayment.rows[0].razorpay_order_id;
    } else {
      // Check if real Razorpay credentials exist to create remote order
      const keyId = process.env.RAZORPAY_KEY_ID?.trim();
      const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

      if (keyId && keySecret) {
        const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
        const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: order.currency,
            receipt: order.order_number,
          }),
        });

        if (rzpResponse.ok) {
          const rzpData = await rzpResponse.json();
          razorpayOrderId = rzpData.id;
        } else {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Payment gateway order initialization failed." }, { status: 502 });
        }
      } else {
        // In development/test mode only: Fail closed if simulation is not explicitly allowed
        if (!isPaymentSimulationAllowed()) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Payment gateway credentials are not configured." }, { status: 500 });
        }
        razorpayOrderId = `order_${crypto.randomBytes(8).toString("hex")}`;
      }

      await client.query(
        `INSERT INTO public.ecom_payments (
           ecom_order_id, gateway, razorpay_order_id, amount, currency, status, method
         )
         VALUES ($1, 'RAZORPAY', $2, $3, $4, 'CREATED', 'UPI_OR_CARD')
         ON CONFLICT (razorpay_order_id) DO NOTHING`,
        [order.id, razorpayOrderId, totalAmount, order.currency],
      );
    }

    await client.query("COMMIT");

    const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_sourceasia_dev";

    return NextResponse.json({
      razorpayOrderId,
      amount: amountInPaise,
      currency: order.currency,
      keyId,
      orderNumber: order.order_number,
      expiresAt: holdExpiresAt.toISOString(),
      paymentWindowMinutes: 10,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not create Razorpay payment order:", error);
    return NextResponse.json({ error: "Could not create payment order." }, { status: 500 });
  } finally {
    client.release();
  }
}


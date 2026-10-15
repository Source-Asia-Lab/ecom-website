import { NextResponse, type NextRequest } from "next/server";
import { getEcommerceDbPool } from "@/app/lib/db";
import {
  verifyWebhookSignature,
  processPaymentConfirmationTransaction,
} from "@/app/lib/razorpay-service";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error("Could not read webhook body:", err);
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing x-razorpay-signature header." }, { status: 400 });
  }

  // 1. Signature Verification: Must fail closed if secret is missing or invalid
  const sigCheck = verifyWebhookSignature({
    rawBody,
    signature,
  });

  if (!sigCheck.valid) {
    console.error("Webhook signature verification failed:", sigCheck.error);
    return NextResponse.json(
      { error: sigCheck.error || "Webhook signature mismatch." },
      { status: 400 },
    );
  }

  let eventPayload: {
    event?: string;
    event_id?: string;
    id?: string;
    payload?: {
      payment?: {
        entity?: {
          id: string;
          order_id: string;
          amount: number | string;
          currency: string;
          status: string;
          method?: string;
        };
      };
      order?: {
        entity?: {
          id: string;
          amount: number | string;
          currency: string;
          status: string;
        };
      };
    };
  };

  try {
    eventPayload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Webhook body is not valid JSON." }, { status: 400 });
  }

  const eventType = eventPayload.event || "unknown";
  const eventId =
    request.headers.get("x-razorpay-event-id") ||
    eventPayload.event_id ||
    eventPayload.id ||
    `evt_${crypto.createHash("sha256").update(rawBody).digest("hex")}`;

  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");

    // 2. Idempotency Check: Guard against duplicate delivery
    const webhookInsert = await client.query<{ id: string }>(
      `INSERT INTO public.ecom_payment_webhooks (event_id, event_type, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [eventId, eventType, JSON.stringify(eventPayload)],
    );

    if (webhookInsert.rows.length === 0) {
      // Event was already processed
      await client.query("COMMIT");
      return NextResponse.json({
        status: "ignored",
        message: "Duplicate webhook event already processed.",
        eventId,
      });
    }

    // 3. Process Payment Confirmation Events
    if (eventType === "payment.captured" || eventType === "order.paid") {
      const paymentEntity = eventPayload.payload?.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id || eventPayload.payload?.order?.entity?.id;
      const paymentId = paymentEntity?.id || `pay_${Date.now()}`;
      const amountPaise = paymentEntity ? Math.round(Number(paymentEntity.amount)) : null;
      const currency = paymentEntity?.currency || "INR";

      if (rzpOrderId) {
        // Find corresponding order and payment record
        const paymentRes = await client.query<{
          ecom_order_id: string;
          amount: string | number;
          currency: string;
          order_number: string;
        }>(
          `SELECT p.ecom_order_id, p.amount, p.currency, o.order_number
           FROM public.ecom_payments p
           JOIN public.ecom_orders o ON o.id = p.ecom_order_id
           WHERE p.razorpay_order_id = $1
           FOR UPDATE`,
          [rzpOrderId],
        );

        const paymentRecord = paymentRes.rows[0];
        if (paymentRecord) {
          // Currency validation - must be INR
          if (currency.toUpperCase() !== "INR" || paymentRecord.currency.toUpperCase() !== "INR") {
            await client.query("ROLLBACK");
            console.error(
              `Webhook currency mismatch for order ${paymentRecord.order_number}: expected INR, received ${currency}`,
            );
            return NextResponse.json({ error: "Webhook payment currency mismatch." }, { status: 400 });
          }

          // Amount validation - exact paise
          const expectedPaise = Math.round(Number(paymentRecord.amount) * 100);
          if (amountPaise === null || !Number.isFinite(amountPaise) || amountPaise <= 0 || amountPaise !== expectedPaise) {
            await client.query("ROLLBACK");
            console.error(
              `Webhook amount mismatch for order ${paymentRecord.order_number}: expected ${expectedPaise}, received ${amountPaise}`,
            );
            return NextResponse.json({ error: "Webhook payment amount mismatch." }, { status: 400 });
          }

          // Execute atomic confirmation
          await processPaymentConfirmationTransaction({
            client,
            orderId: paymentRecord.ecom_order_id,
            orderNumber: paymentRecord.order_number,
            razorpayOrderId: rzpOrderId,
            paymentId,
            signature: signature,
            method: paymentEntity?.method || "RAZORPAY_WEBHOOK",
            isSimulated: false,
          });
        }
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ status: "success", eventId });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Error processing Razorpay webhook:", error);
    return NextResponse.json({ error: "Webhook processing failure." }, { status: 500 });
  } finally {
    client.release();
  }
}

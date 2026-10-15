import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getEcommerceDbPool } from "@/app/lib/db";
import { enqueueOrderNotification } from "@/app/lib/notification-outbox";

type RefundStatus = "APPROVED" | "REJECTED" | "PROCESSING" | "COMPLETED";
const REFUND_STATUSES = new Set<RefundStatus>(["APPROVED", "REJECTED", "PROCESSING", "COMPLETED"]);

async function getStaffSession() {
  const session = await auth();
  return session?.user?.role === "staff" && session.user.email ? session : null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const { orderNumber } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("amount" in body) || typeof body.amount !== "number" ||
      !Number.isFinite(body.amount) || body.amount <= 0 || Math.round(body.amount * 100) !== body.amount * 100 || !("reason" in body) ||
      typeof body.reason !== "string" || body.reason.trim().length < 5 || body.reason.length > 1000) {
    return NextResponse.json({ error: "Provide a valid refund amount and reason." }, { status: 400 });
  }

  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query<{
      id: string;
      total_amount: string | number;
      payment_status: string;
      billing_address_snapshot: { email?: string; contactPerson?: string; phone?: string };
    }>(
      `SELECT id, total_amount, payment_status, billing_address_snapshot
       FROM public.ecom_orders WHERE order_number = $1 FOR UPDATE`,
      [orderNumber],
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (!new Set(["PAID", "PARTIALLY_REFUNDED"]).has(order.payment_status)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Refunds can only be requested for a payment-confirmed order." }, { status: 409 });
    }
    const totals = await client.query<{ refund_total: string | number }>(
      `SELECT COALESCE(SUM(amount), 0) AS refund_total
       FROM public.ecom_refund_requests
       WHERE ecom_order_id = $1 AND status <> 'REJECTED'`,
      [order.id],
    );
    const alreadyRequested = Number(totals.rows[0].refund_total);
    if (alreadyRequested + body.amount > Number(order.total_amount)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Refund amount exceeds the remaining order balance." }, { status: 409 });
    }

    const refundResult = await client.query<{ id: string }>(
      `INSERT INTO public.ecom_refund_requests (ecom_order_id, requested_by, amount, reason)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [order.id, session.user.email, body.amount, body.reason.trim()],
    );
    const refundId = refundResult.rows[0].id;
    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, after_data)
       VALUES ($1, 'CREATE_REFUND_REQUEST', 'REFUND', $2, $3::jsonb)`,
      [session.user.email, refundId, JSON.stringify({ orderNumber, amount: body.amount, reason: body.reason.trim() })],
    );
    await enqueueOrderNotification(client, {
      eventKey: `refund:${refundId}:requested`,
      eventType: "REFUND_RESULT",
      orderId: order.id,
      orderNumber,
      email: order.billing_address_snapshot.email,
      phone: order.billing_address_snapshot.phone,
      customerName: order.billing_address_snapshot.contactPerson,
      message: `A refund request for ${body.amount.toFixed(2)} has been recorded and is awaiting review. No refund has been processed yet.`,
      status: "REQUESTED",
    });
    await client.query("COMMIT");
    return NextResponse.json({ refundId, status: "REQUESTED" }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not create refund request:", error);
    return NextResponse.json({ error: "Could not create refund request." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  const { orderNumber } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("refundId" in body) || typeof body.refundId !== "string" ||
      !("status" in body) || typeof body.status !== "string" || !REFUND_STATUSES.has(body.status as RefundStatus) ||
      ("externalReference" in body && typeof body.externalReference !== "string") ||
      ("reviewNote" in body && typeof body.reviewNote !== "string") ||
      ("paymentVerified" in body && typeof body.paymentVerified !== "boolean")) {
    return NextResponse.json({ error: "Refund update is invalid." }, { status: 400 });
  }
  const status = body.status as RefundStatus;
  const externalReference = "externalReference" in body && typeof body.externalReference === "string"
    ? body.externalReference.trim()
    : "";
  const reviewNote = "reviewNote" in body && typeof body.reviewNote === "string"
    ? body.reviewNote.trim().slice(0, 1000)
    : "";
  const paymentVerified = "paymentVerified" in body && body.paymentVerified === true;
  if (status === "COMPLETED" && (!externalReference || externalReference.length > 255 || !paymentVerified)) {
    return NextResponse.json({ error: "Completing a refund requires a verified provider reference and staff confirmation." }, { status: 400 });
  }
  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      amount: string | number;
      status: string;
      ecom_order_id: string;
      order_number: string;
      total_amount: string | number;
      billing_address_snapshot: { email?: string; contactPerson?: string; phone?: string };
    }>(
      `SELECT refunds.id, refunds.amount, refunds.status, orders.id AS ecom_order_id,
              orders.order_number, orders.total_amount, orders.billing_address_snapshot
       FROM public.ecom_refund_requests refunds
       JOIN public.ecom_orders orders ON orders.id = refunds.ecom_order_id
       WHERE refunds.id = $1 AND orders.order_number = $2
       FOR UPDATE OF refunds, orders`,
      [body.refundId, orderNumber],
    );
    const refund = result.rows[0];
    if (!refund) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Refund request not found." }, { status: 404 });
    }
    const allowedNext: Record<string, string[]> = {
      REQUESTED: ["APPROVED", "REJECTED"],
      APPROVED: ["PROCESSING", "REJECTED"],
      PROCESSING: ["COMPLETED"],
    };
    if (!allowedNext[refund.status]?.includes(status)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Cannot change refund from ${refund.status} to ${status}.` }, { status: 409 });
    }
    await client.query(
      `UPDATE public.ecom_refund_requests
       SET status = $2, reviewed_by = $3, review_note = NULLIF($4, ''),
           external_reference = NULLIF($5, ''), updated_at = CURRENT_TIMESTAMP,
           completed_at = CASE WHEN $2 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = $1`,
      [refund.id, status, session.user.email, reviewNote, externalReference],
    );
    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
       VALUES ($1, 'UPDATE_REFUND', 'REFUND', $2, $3::jsonb, $4::jsonb)`,
      [session.user.email, refund.id, JSON.stringify({ status: refund.status }), JSON.stringify({ status, reviewNote, externalReference })],
    );

    if (status === "COMPLETED") {
      const totalRefunded = await client.query<{ amount: string | number }>(
        `SELECT COALESCE(SUM(amount), 0) AS amount
         FROM public.ecom_refund_requests
         WHERE ecom_order_id = $1 AND status = 'COMPLETED'`,
        [refund.ecom_order_id],
      );
      const nextPaymentStatus = Number(totalRefunded.rows[0].amount) >= Number(refund.total_amount)
        ? "REFUNDED"
        : "PARTIALLY_REFUNDED";
      await client.query(
        `UPDATE public.ecom_orders SET payment_status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [refund.ecom_order_id, nextPaymentStatus],
      );
      await client.query(
        `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
         VALUES ($1, 'UPDATE_PAYMENT_STATUS', 'ORDER', $2, $3::jsonb, $4::jsonb)`,
        [
          session.user.email,
          refund.order_number,
          JSON.stringify({ status: "PAID" }),
          JSON.stringify({ status: nextPaymentStatus, refundId: refund.id }),
        ],
      );
      await client.query(
        `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, after_data)
         VALUES ($1, 'VERIFY_REFUND_COMPLETION', 'REFUND', $2, $3::jsonb)`,
        [session.user.email, refund.id, JSON.stringify({ externalReference, paymentVerified })],
      );
    }

    await enqueueOrderNotification(client, {
      eventKey: `refund:${refund.id}:${status.toLowerCase()}`,
      eventType: "REFUND_RESULT",
      orderId: refund.ecom_order_id,
      orderNumber,
      email: refund.billing_address_snapshot.email,
      phone: refund.billing_address_snapshot.phone,
      customerName: refund.billing_address_snapshot.contactPerson,
      message: status === "COMPLETED"
        ? `Your refund of ${Number(refund.amount).toFixed(2)} has been recorded as processed. Reference: ${externalReference}. Bank posting times may vary.`
        : status === "APPROVED"
        ? "Your refund request has been approved. Processing through the payment provider is not yet available."
        : status === "REJECTED"
          ? "Your refund request was not approved. Contact support if you need more information."
          : "Your approved refund request is awaiting payment-provider processing. No refund has been sent yet.",
      status,
    });

    await client.query("COMMIT");
    return NextResponse.json({ refundId: refund.id, status });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not update refund request:", error);
    return NextResponse.json({ error: "Could not update refund request." }, { status: 500 });
  } finally {
    client.release();
  }
}
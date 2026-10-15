import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getEcommerceDbPool } from "@/app/lib/db";
import { enqueueOrderNotification } from "@/app/lib/notification-outbox";

const STATUSES = new Set(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.user.role !== "staff") return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const statuses = request.nextUrl.searchParams.get("status")
    ?.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean) ?? [];
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || statuses.some((status) => !STATUSES.has(status))) {
    return NextResponse.json({ error: "Support filters are invalid." }, { status: 400 });
  }

  try {
    const result = await getEcommerceDbPool().query(
      `SELECT ticket_number, order_number, customer_name, customer_email, customer_phone,
              subject, category, message, status, assigned_to, created_at, updated_at
       FROM public.ecom_support_tickets
      WHERE (cardinality($1::text[]) = 0 OR status = ANY($1::text[]))
      ORDER BY created_at ASC
      LIMIT $2`,
          [statuses, limit],
    );
    return NextResponse.json({ tickets: result.rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load staff support queue:", error);
    return NextResponse.json({ error: "Could not load support requests." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.user.role !== "staff" || !session.user.email) {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("ticketNumber" in body) ||
      typeof body.ticketNumber !== "string" || !("status" in body) ||
      typeof body.status !== "string" || !STATUSES.has(body.status) ||
      !("reply" in body) || typeof body.reply !== "string" ||
      body.reply.trim().length < 3 || body.reply.length > 4000) {
    return NextResponse.json({ error: "Provide a ticket, supported status, and reply." }, { status: 400 });
  }

  const { ticketNumber, status, reply } = body;
  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      ticket_number: string;
      status: string;
      customer_email: string;
      customer_name: string;
      order_number: string | null;
    }>(
      `SELECT id, ticket_number, status, customer_email, customer_name, order_number
       FROM public.ecom_support_tickets WHERE ticket_number = $1 FOR UPDATE`,
      [ticketNumber],
    );
    const ticket = result.rows[0];
    if (!ticket) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Support ticket not found." }, { status: 404 });
    }
    await client.query(
      `UPDATE public.ecom_support_tickets SET status = $2, assigned_to = $3,
         updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [ticket.id, status, session.user.email],
    );
    const messageResult = await client.query<{ id: string }>(
      `INSERT INTO public.ecom_support_messages (ticket_id, author_email, author_role, message)
       VALUES ($1, $2, 'STAFF', $3) RETURNING id`,
      [ticket.id, session.user.email, reply.trim()],
    );
    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
       VALUES ($1, 'REPLY_AND_UPDATE', 'SUPPORT_TICKET', $2, $3::jsonb, $4::jsonb)`,
      [session.user.email, ticket.ticket_number, JSON.stringify({ status: ticket.status }), JSON.stringify({ status, replyRecorded: true })],
    );
    await enqueueOrderNotification(client, {
      eventKey: `support-ticket:${messageResult.rows[0].id}`,
      eventType: "SUPPORT_UPDATE",
      orderNumber: ticket.ticket_number,
      email: ticket.customer_email,
      customerName: ticket.customer_name,
      message: reply.trim(),
      status,
    });
    await enqueueOrderNotification(client, {
      eventKey: `support-ticket:${messageResult.rows[0].id}:staff-alert`,
      eventType: "SUPPORT_UPDATE",
      orderNumber: ticket.ticket_number,
      email: process.env.NOTIFICATION_SUPPORT_EMAIL,
      customerName: "Support team",
      message: `${session.user.email} replied to ${ticket.ticket_number}. Current status: ${status}.`,
      status,
    });
    await client.query("COMMIT");
    return NextResponse.json({ ticketNumber: ticket.ticket_number, status });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not update support ticket:", error);
    return NextResponse.json({ error: "Could not update support request." }, { status: 500 });
  } finally {
    client.release();
  }
}
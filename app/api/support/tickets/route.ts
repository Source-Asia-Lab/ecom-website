import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getEcommerceDbPool } from "@/app/lib/db";
import { enqueueOrderNotification } from "@/app/lib/notification-outbox";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORIES = new Set(["ORDER", "PAYMENT", "RETURN", "REFUND", "PRODUCT", "PRIVACY", "OTHER"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 16_384) {
    return NextResponse.json({ error: "Support request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Support request is invalid." }, { status: 400 });
  }

  const session = await auth();
  const sessionEmail = session?.user?.email?.trim().toLowerCase() || null;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const category = typeof body.category === "string" ? body.category : "OTHER";
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";

  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ ticket: { status: "received" } }, { status: 201 });
  }
  if (sessionEmail && email !== sessionEmail) {
    return NextResponse.json({ error: "Use the email address from your signed-in account." }, { status: 403 });
  }
  if (!name || name.length > 200 || !EMAIL_PATTERN.test(email) || email.length > 255 ||
      phone.length > 20 || subject.length < 4 || subject.length > 160 ||
      message.length < 10 || message.length > 5000 || !CATEGORIES.has(category) ||
      orderNumber.length > 50) {
    return NextResponse.json({ error: "Check the support request details and try again." }, { status: 400 });
  }

  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");
    let customerId: string | null = null;
    if (sessionEmail) {
      const nameParts = name.split(/\s+/);
      const customer = await client.query<{ id: string }>(
        `INSERT INTO public.ecom_customers (email, first_name, last_name, phone)
         VALUES ($1, $2, $3, NULLIF($4, ''))
         ON CONFLICT (email) DO UPDATE SET
           first_name = COALESCE(public.ecom_customers.first_name, EXCLUDED.first_name),
           last_name = COALESCE(public.ecom_customers.last_name, EXCLUDED.last_name),
           phone = COALESCE(public.ecom_customers.phone, EXCLUDED.phone),
           updated_at = CURRENT_TIMESTAMP
         WHERE public.ecom_customers.is_active = true
         RETURNING id`,
        [sessionEmail, nameParts[0], nameParts.slice(1).join(" ") || null, phone],
      );
      customerId = customer.rows[0]?.id ?? null;
      if (!customerId) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "This customer account is inactive." }, { status: 403 });
      }
    }

    let orderId: string | null = null;
    if (orderNumber && customerId) {
      const order = await client.query<{ id: string }>(
        "SELECT id FROM public.ecom_orders WHERE order_number = $1 AND ecom_customer_id = $2",
        [orderNumber, customerId],
      );
      if (!order.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "That order was not found in your account." }, { status: 404 });
      }
      orderId = order.rows[0].id;
    }

    const ticketResult = await client.query<{ id: string; ticket_number: string }>(
      `INSERT INTO public.ecom_support_tickets (
         ecom_customer_id, ecom_order_id, order_number, customer_name,
         customer_email, customer_phone, subject, category, message
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, ticket_number`,
      [customerId, orderId, orderNumber || null, name, email, phone || null, subject, category, message],
    );
    const ticket = ticketResult.rows[0];
    await client.query(
      `INSERT INTO public.ecom_support_messages (ticket_id, author_email, author_role, message)
       VALUES ($1, $2, 'CUSTOMER', $3)`,
      [ticket.id, email, message],
    );
    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, after_data)
       VALUES ($1, 'CREATE', 'SUPPORT_TICKET', $2, $3::jsonb)`,
      [email, ticket.ticket_number, JSON.stringify({ category, subject })],
    );
    await enqueueOrderNotification(client, {
      eventKey: `support-ticket:${ticket.id}:created`,
      eventType: "SUPPORT_UPDATE",
      orderNumber: ticket.ticket_number,
      email,
      customerName: name,
      message: `We received your support request (${ticket.ticket_number}) and will review it.`,
      status: "OPEN",
    });
    await enqueueOrderNotification(client, {
      eventKey: `support-ticket:${ticket.id}:staff-alert`,
      eventType: "SUPPORT_UPDATE",
      orderNumber: ticket.ticket_number,
      email: process.env.NOTIFICATION_SUPPORT_EMAIL,
      customerName: "Support team",
      message: `New ${category.toLowerCase()} request from ${name} (${email}). Subject: ${subject}. ${message}`,
      status: "OPEN",
    });
    await client.query("COMMIT");
    return NextResponse.json({ ticketNumber: ticket.ticket_number, status: "OPEN" }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not create support ticket:", error);
    return NextResponse.json({ error: "Could not submit your support request." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Sign in to view support requests." }, { status: 401 });

  try {
    const customer = await getEcommerceDbPool().query<{ id: string }>(
      "SELECT id FROM public.ecom_customers WHERE email = $1 AND is_active = true",
      [email],
    );
    if (!customer.rows[0]) {
      return NextResponse.json({ tickets: [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const result = await getEcommerceDbPool().query(
      `SELECT ticket_number, order_number, subject, category, status, created_at, updated_at
       FROM public.ecom_support_tickets
       WHERE ecom_customer_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [customer.rows[0].id],
    );
    return NextResponse.json({ tickets: result.rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load support tickets:", error);
    return NextResponse.json({ error: "Could not load support requests." }, { status: 500 });
  }
}
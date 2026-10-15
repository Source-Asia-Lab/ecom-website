import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEcommerceDbPool } from "@/app/lib/db";

interface NotificationJob {
  id: string;
  event_type: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  payload: {
    orderNumber?: string;
    customerName?: string;
    message?: string;
    status?: string;
    trackingUrl?: string;
  };
  attempts: number;
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.NOTIFICATION_WORKER_TOKEN ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function getNotificationContent(job: NotificationJob): { subject: string; text: string } {
  const { orderNumber = "your request", customerName = "Customer", message = "", status = "" } = job.payload;
  const greeting = `Hello ${customerName},`;
  switch (job.event_type) {
    case "ORDER_RECEIVED":
      return {
        subject: `Source Asia request received: ${orderNumber}`,
        text: `${greeting}\n\nWe received your order request ${orderNumber}. It is pending review. This is not a payment confirmation, and inventory has not been reserved.\n\n${message}`,
      };
    case "PAYMENT_RESULT":
      return { subject: `Payment update: ${orderNumber}`, text: `${greeting}\n\n${message}` };
    case "DISPATCH":
      return {
        subject: `Dispatch update: ${orderNumber}`,
        text: `${greeting}\n\nYour order ${orderNumber} has been dispatched. ${job.payload.trackingUrl ? `Track it here: ${job.payload.trackingUrl}` : message}`,
      };
    case "DELIVERY":
      return { subject: `Delivery update: ${orderNumber}`, text: `${greeting}\n\n${message || `Order ${orderNumber} has been marked delivered.`}` };
    case "CANCELLATION":
      return { subject: `Cancellation update: ${orderNumber}`, text: `${greeting}\n\n${message || `Request ${orderNumber} status: ${status}.`}` };
    case "REFUND_RESULT":
      return { subject: `Refund update: ${orderNumber}`, text: `${greeting}\n\n${message}` };
    default:
      return { subject: `Source Asia support update: ${orderNumber}`, text: `${greeting}\n\n${message}` };
  }
}

async function sendEmail(job: NotificationJob, subject: string, text: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Email provider is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [job.recipient], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  const result = (await response.json()) as { id?: string };
  return result.id ?? null;
}

async function sendSms(job: NotificationJob, text: string): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) throw new Error("SMS provider is not configured.");

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: job.recipient, From: from, Body: text.slice(0, 1500) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`SMS provider returned HTTP ${response.status}.`);
  const result = (await response.json()) as { sid?: string };
  return result.sid ?? null;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const pool = getEcommerceDbPool();
  let jobs: NotificationJob[];
  try {
    const result = await pool.query<NotificationJob>(
      `WITH ready AS (
         SELECT id FROM public.ecom_notification_outbox
        WHERE (status IN ('PENDING', 'RETRY') AND next_attempt_at <= CURRENT_TIMESTAMP)
          OR (status = 'PROCESSING' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 20
       )
       UPDATE public.ecom_notification_outbox jobs
       SET status = 'PROCESSING', attempts = jobs.attempts + 1,
           updated_at = CURRENT_TIMESTAMP
       FROM ready
       WHERE jobs.id = ready.id
       RETURNING jobs.id, jobs.event_type, jobs.channel, jobs.recipient, jobs.payload, jobs.attempts`,
    );
    jobs = result.rows;
  } catch (error) {
    console.error("Could not claim notification jobs:", error);
    return NextResponse.json({ error: "Could not process notifications." }, { status: 500 });
  }

  let sent = 0;
  let retried = 0;
  for (const job of jobs) {
    const content = getNotificationContent(job);
    try {
      const providerMessageId = job.channel === "EMAIL"
        ? await sendEmail(job, content.subject, content.text)
        : await sendSms(job, content.text);
      await pool.query(
        `UPDATE public.ecom_notification_outbox
         SET status = 'SENT', provider_message_id = $2, last_error = NULL,
             sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [job.id, providerMessageId],
      );
      sent++;
    } catch (error) {
      const exhausted = job.attempts >= 8;
      const delayMinutes = Math.min(60, 2 ** Math.min(job.attempts, 6));
      await pool.query(
        `UPDATE public.ecom_notification_outbox
         SET status = $2, last_error = $3,
             next_attempt_at = CURRENT_TIMESTAMP + ($4 * INTERVAL '1 minute'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [job.id, exhausted ? "DEAD" : "RETRY", error instanceof Error ? error.message.slice(0, 300) : "Provider delivery failed.", delayMinutes],
      );
      retried++;
    }
  }

  return NextResponse.json({ claimed: jobs.length, sent, retried });
}
import type { PoolClient } from "pg";

export type NotificationEvent =
  | "ORDER_RECEIVED"
  | "PAYMENT_RESULT"
  | "DISPATCH"
  | "DELIVERY"
  | "CANCELLATION"
  | "REFUND_RESULT"
  | "SUPPORT_UPDATE";

interface QueueNotificationInput {
  eventKey: string;
  eventType: NotificationEvent;
  orderId?: string | null;
  orderNumber: string;
  email?: string | null;
  phone?: string | null;
  customerName?: string | null;
  message?: string | null;
  status?: string | null;
  trackingUrl?: string | null;
}

export async function enqueueOrderNotification(
  client: PoolClient,
  input: QueueNotificationInput,
): Promise<void> {
  const payload = {
    orderNumber: input.orderNumber,
    customerName: input.customerName || "Customer",
    message: input.message || "",
    status: input.status || "",
    trackingUrl: input.trackingUrl || "",
  };

  const recipients = [
    input.email ? { channel: "EMAIL", recipient: input.email.trim().toLowerCase() } : null,
    input.phone ? { channel: "SMS", recipient: input.phone.trim() } : null,
  ].filter((recipient): recipient is { channel: string; recipient: string } => Boolean(recipient));

  for (const { channel, recipient } of recipients) {
    await client.query(
      `INSERT INTO public.ecom_notification_outbox (
         event_key, event_type, channel, recipient, payload, ecom_order_id
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        `${input.eventKey}:${channel.toLowerCase()}`,
        input.eventType,
        channel,
        recipient,
        JSON.stringify(payload),
        input.orderId ?? null,
      ],
    );
  }
}
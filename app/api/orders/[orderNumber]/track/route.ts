import { NextResponse, type NextRequest } from "next/server";
import { ecommerceQuery } from "@/app/lib/db";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  const { orderNumber } = await context.params;
  const trimmed = orderNumber?.trim();

  if (!trimmed || !/^ECOM-\d{4}-\d+$/i.test(trimmed)) {
    return NextResponse.json({ error: "Invalid order number." }, { status: 400 });
  }

  try {
    const orderRes = await ecommerceQuery<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      currency: string;
      total_amount: string | number;
      created_at: string | Date;
    }>(
      `SELECT id, order_number, status, payment_status, currency, total_amount, created_at
       FROM public.ecom_orders
       WHERE order_number = $1`,
      [trimmed],
    );

    const order = orderRes.rows[0];
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const shipmentsRes = await ecommerceQuery<{
      id: string;
      carrier_name: string | null;
      awb_number: string | null;
      tracking_url: string | null;
      status: string;
      shipped_at: string | Date | null;
      delivered_at: string | Date | null;
      notes: string | null;
      created_at: string | Date;
    }>(
      `SELECT id, carrier_name, awb_number, tracking_url, status,
              shipped_at, delivered_at, notes, created_at
       FROM public.ecom_shipments
       WHERE ecom_order_id = $1
       ORDER BY created_at DESC`,
      [order.id],
    );

    return NextResponse.json({
      orderNumber: order.order_number,
      status: order.status,
      paymentStatus: order.payment_status,
      currency: order.currency,
      totalAmount: Number(order.total_amount),
      createdAt: order.created_at,
      shipments: shipmentsRes.rows.map((s) => ({
        id: s.id,
        carrierName: s.carrier_name,
        awbNumber: s.awb_number,
        trackingUrl: s.tracking_url,
        status: s.status,
        shippedAt: s.shipped_at,
        deliveredAt: s.delivered_at,
        notes: s.notes,
        createdAt: s.created_at,
      })),
    });
  } catch (error) {
    console.error(`Could not retrieve tracking for order ${trimmed}:`, error);
    return NextResponse.json({ error: "Could not retrieve order tracking." }, { status: 500 });
  }
}

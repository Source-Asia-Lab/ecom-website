import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getEcommerceDbPool } from "@/app/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.user.role !== "staff") return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  try {
    const result = await getEcommerceDbPool().query(
      `SELECT refunds.id, orders.order_number, refunds.amount, refunds.reason, refunds.status,
              refunds.requested_by, refunds.reviewed_by, refunds.review_note,
              refunds.external_reference, refunds.created_at, refunds.updated_at
       FROM public.ecom_refund_requests refunds
       JOIN public.ecom_orders orders ON orders.id = refunds.ecom_order_id
       ORDER BY refunds.created_at ASC
       LIMIT 100`,
    );
    return NextResponse.json({ refunds: result.rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load refund queue:", error);
    return NextResponse.json({ error: "Could not load refund requests." }, { status: 500 });
  }
}
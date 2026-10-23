import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ecommerceQuery } from "@/app/lib/db";

/**
 * GET /api/admin/bank-transfers
 * Staff-only queue of bank transfer payments awaiting verification.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (session.user.role !== "staff") {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  try {
    const result = await ecommerceQuery<{
      order_number: string;
      transfer_reference: string;
      amount: string | number;
      currency: string;
      status: string;
      utr_reference: string | null;
      created_at: string | Date;
    }>(
      `SELECT o.order_number, p.razorpay_order_id AS transfer_reference,
              p.amount, p.currency, p.status, p.utr_reference, p.created_at
       FROM public.ecom_payments p
       JOIN public.ecom_orders o ON o.id = p.ecom_order_id
       WHERE p.gateway = 'BANK_TRANSFER'
         AND p.status IN ('CREATED', 'PENDING_VERIFICATION')
       ORDER BY p.created_at DESC
       LIMIT 100`,
    );

    return NextResponse.json(
      { transfers: result.rows },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not load bank transfer queue:", error);
    return NextResponse.json({ error: "Could not load bank transfers." }, { status: 500 });
  }
}

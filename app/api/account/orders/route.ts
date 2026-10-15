import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ecommerceQuery } from "@/app/lib/db";
import { linkGuestOrdersToCustomer } from "@/app/lib/account-linking";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Sign in to view your orders." }, { status: 401 });
  }

  const isEmailVerified = session?.user?.email_verified === true;

  try {
    // 1. Ensure customer record exists
    const customerRes = await ecommerceQuery<{ id: string }>(
      `INSERT INTO public.ecom_customers (email)
       VALUES ($1)
       ON CONFLICT (email) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [email],
    );
    const customerId = customerRes.rows[0]?.id;

    // 2. If email is verified, securely link any previous unassigned guest orders
    if (customerId && isEmailVerified) {
      await linkGuestOrdersToCustomer({
        email,
        isEmailVerified: true,
        customerId,
      });
    }

    // 3. Retrieve orders strictly owned by this customer
    const result = await ecommerceQuery<{
      order_number: string;
      status: string;
      payment_status: string;
      currency: string;
      total_amount: string | number;
      created_at: string | Date;
    }>(
      `SELECT orders.order_number, orders.status, orders.payment_status,
              orders.currency, orders.total_amount, orders.created_at
       FROM public.ecom_orders orders
       WHERE orders.ecom_customer_id = $1
       ORDER BY orders.created_at DESC
       LIMIT 50`,
      [customerId],
    );

    return NextResponse.json(
      { orders: result.rows },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not load customer order history:", error);
    return NextResponse.json({ error: "Could not load your orders." }, { status: 500 });
  }
}
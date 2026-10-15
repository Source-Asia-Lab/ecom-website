import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getEcommerceDbPool } from "@/app/lib/db";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const res = await getEcommerceDbPool().query<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      company_name: string | null;
      gstin: string | null;
    }>(
      `SELECT id, email, first_name, last_name, phone, company_name, gstin
       FROM public.ecom_customers
       WHERE LOWER(email) = $1`,
      [email],
    );

    const customer = res.rows[0];
    if (!customer) {
      return NextResponse.json({
        email,
        firstName: session?.user?.name?.split(/\s+/)[0] || "",
        lastName: session?.user?.name?.split(/\s+/).slice(1).join(" ") || "",
        phone: "",
        companyName: "",
        gstin: "",
      });
    }

    return NextResponse.json({
      id: customer.id,
      email: customer.email,
      firstName: customer.first_name || "",
      lastName: customer.last_name || "",
      phone: customer.phone || "",
      companyName: customer.company_name || "",
      gstin: customer.gstin || "",
    });
  } catch (error) {
    console.error("Could not fetch customer profile:", error);
    return NextResponse.json({ error: "Could not load profile." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Profile payload is required." }, { status: 400 });
  }

  const {
    firstName = "",
    lastName = "",
    phone = "",
    companyName = "",
    gstin = "",
  } = body as Record<string, unknown>;

  try {
    const res = await getEcommerceDbPool().query(
      `INSERT INTO public.ecom_customers (
         email, first_name, last_name, phone, company_name, gstin
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         phone = EXCLUDED.phone,
         company_name = EXCLUDED.company_name,
         gstin = EXCLUDED.gstin,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [
        email,
        typeof firstName === "string" ? firstName.trim() : null,
        typeof lastName === "string" ? lastName.trim() : null,
        typeof phone === "string" ? phone.trim() : null,
        typeof companyName === "string" ? companyName.trim() : null,
        typeof gstin === "string" ? gstin.trim().toUpperCase() : null,
      ],
    );

    return NextResponse.json({ success: true, customerId: res.rows[0].id });
  } catch (error) {
    console.error("Could not update customer profile:", error);
    return NextResponse.json({ error: "Could not update profile." }, { status: 500 });
  }
}

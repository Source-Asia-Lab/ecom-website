import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getEcommerceDbPool } from "@/app/lib/db";
import { INDIAN_STATES } from "@/app/checkout/checkout-utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const client = await getEcommerceDbPool().connect();
    try {
      const res = await client.query<{
        id: string;
        address_type: string;
        full_name: string;
        phone: string;
        address_line_1: string;
        address_line_2: string | null;
        city: string;
        state: string;
        postal_code: string;
        country: string;
        is_default: boolean;
      }>(
        `SELECT a.id, a.address_type, a.full_name, a.phone,
                a.address_line_1, a.address_line_2, a.city, a.state,
                a.postal_code, a.country, a.is_default
         FROM public.ecom_addresses a
         JOIN public.ecom_customers c ON c.id = a.ecom_customer_id
         WHERE LOWER(c.email) = $1
         ORDER BY a.is_default DESC, a.created_at DESC`,
        [email],
      );

      return NextResponse.json(
        { addresses: res.rows },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Could not fetch addresses:", error);
    return NextResponse.json({ error: "Could not load saved addresses." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: "Address payload is required." }, { status: 400 });
  }

  const {
    addressType = "shipping",
    fullName,
    phone,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    isDefault = false,
  } = body as Record<string, unknown>;

  if (
    typeof fullName !== "string" || !fullName.trim() || fullName.length > 200 ||
    typeof phone !== "string" || !/^\+?[0-9\s-]{10,15}$/.test(phone.trim()) ||
    typeof addressLine1 !== "string" || !addressLine1.trim() || addressLine1.length > 500 ||
    typeof city !== "string" || !city.trim() || city.length > 100 ||
    typeof state !== "string" || !INDIAN_STATES.includes(state.trim()) ||
    typeof postalCode !== "string" || !/^\d{6}$/.test(postalCode.trim())
  ) {
    return NextResponse.json({ error: "Address details are invalid." }, { status: 400 });
  }

  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");

    // Ensure customer exists
    let customerResult = await client.query<{ id: string }>(
      "SELECT id FROM public.ecom_customers WHERE LOWER(email) = $1",
      [email],
    );

    let customerId = customerResult.rows[0]?.id;
    if (!customerId) {
      const nameParts = fullName.trim().split(/\s+/);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.ecom_customers (email, first_name, last_name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [email, nameParts[0] || null, nameParts.slice(1).join(" ") || null, phone.trim()],
      );
      customerId = inserted.rows[0].id;
    }

    if (isDefault) {
      await client.query(
        "UPDATE public.ecom_addresses SET is_default = false WHERE ecom_customer_id = $1",
        [customerId],
      );
    }

    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO public.ecom_addresses (
         ecom_customer_id, address_type, full_name, phone,
         address_line_1, address_line_2, city, state, postal_code, is_default
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        customerId,
        addressType === "billing" ? "billing" : "shipping",
        fullName.trim(),
        phone.trim(),
        addressLine1.trim(),
        typeof addressLine2 === "string" ? addressLine2.trim() : null,
        city.trim(),
        state.trim(),
        postalCode.trim(),
        Boolean(isDefault),
      ],
    );

    await client.query("COMMIT");
    return NextResponse.json(
      { addressId: insertResult.rows[0].id, success: true },
      { status: 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not save address:", error);
    return NextResponse.json({ error: "Could not save address." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Valid address ID is required." }, { status: 400 });
  }

  try {
    const res = await getEcommerceDbPool().query(
      `DELETE FROM public.ecom_addresses a
       USING public.ecom_customers c
       WHERE a.id = $1 AND a.ecom_customer_id = c.id AND LOWER(c.email) = $2`,
      [id, email],
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Address not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Could not delete address:", error);
    return NextResponse.json({ error: "Could not delete address." }, { status: 500 });
  }
}

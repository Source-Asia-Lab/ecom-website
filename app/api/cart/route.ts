import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getEcommerceDbPool } from "@/app/lib/db";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getOrCreateCart(
  customerId: string | null,
  sessionToken: string | null,
): Promise<string> {
  const pool = getEcommerceDbPool();

  if (customerId) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM public.ecom_carts
       WHERE ecom_customer_id = $1 AND status = 'ACTIVE'
       ORDER BY updated_at DESC LIMIT 1`,
      [customerId],
    );
    if (existing.rows[0]) return existing.rows[0].id;
  } else if (sessionToken) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM public.ecom_carts
       WHERE session_token = $1 AND status = 'ACTIVE'
       ORDER BY updated_at DESC LIMIT 1`,
      [sessionToken],
    );
    if (existing.rows[0]) return existing.rows[0].id;
  }

  const created = await pool.query<{ id: string }>(
    `INSERT INTO public.ecom_carts (ecom_customer_id, session_token, status)
     VALUES ($1, $2, 'ACTIVE')
     RETURNING id`,
    [customerId, sessionToken],
  );
  return created.rows[0].id;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  const sessionToken = request.headers.get("x-cart-session") ||
    new URL(request.url).searchParams.get("sessionId");

  if (!email && !sessionToken) {
    return NextResponse.json({ items: [] });
  }

  try {
    const pool = getEcommerceDbPool();
    let customerId: string | null = null;
    if (email) {
      const custRes = await pool.query<{ id: string }>(
        "SELECT id FROM public.ecom_customers WHERE LOWER(email) = $1",
        [email],
      );
      customerId = custRes.rows[0]?.id || null;
    }

    const cartIdRes = await pool.query<{ id: string }>(
      `SELECT id FROM public.ecom_carts
       WHERE (ecom_customer_id = $1 OR session_token = $2) AND status = 'ACTIVE'
       ORDER BY updated_at DESC LIMIT 1`,
      [customerId, sessionToken],
    );

    if (!cartIdRes.rows[0]) {
      return NextResponse.json({ items: [] });
    }

    const cartId = cartIdRes.rows[0].id;
    const itemsRes = await pool.query<{ product_id: string; quantity: number }>(
      `SELECT product_id, quantity FROM public.ecom_cart_items WHERE cart_id = $1`,
      [cartId],
    );

    return NextResponse.json({
      cartId,
      items: itemsRes.rows.map((row) => ({
        productId: row.product_id,
        quantity: Number(row.quantity),
      })),
    });
  } catch (error) {
    console.error("Could not load cart items:", error);
    return NextResponse.json({ error: "Could not load cart." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  const headerToken = request.headers.get("x-cart-session");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Cart payload required." }, { status: 400 });
  }

  const { items, sessionId } = body as {
    items?: Array<{ productId: string; quantity: number }>;
    sessionId?: string;
  };

  const sessionToken = sessionId || headerToken || null;
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Items must be an array." }, { status: 400 });
  }

  for (const item of items) {
    if (!item.productId || !UUID_PATTERN.test(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1) {
      return NextResponse.json({ error: "Invalid cart item." }, { status: 400 });
    }
  }

  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");

    let customerId: string | null = null;
    if (email) {
      const custRes = await client.query<{ id: string }>(
        "SELECT id FROM public.ecom_customers WHERE LOWER(email) = $1",
        [email],
      );
      if (custRes.rows[0]) {
        customerId = custRes.rows[0].id;
      } else {
        const nameParts = (session?.user?.name || "").trim().split(/\s+/);
        const insCust = await client.query<{ id: string }>(
          `INSERT INTO public.ecom_customers (email, first_name, last_name)
           VALUES ($1, $2, $3) RETURNING id`,
          [email, nameParts[0] || null, nameParts.slice(1).join(" ") || null],
        );
        customerId = insCust.rows[0].id;
      }
    }

    const cartId = await getOrCreateCart(customerId, sessionToken);

    // Sync items: replace existing active items
    await client.query("DELETE FROM public.ecom_cart_items WHERE cart_id = $1", [cartId]);

    for (const item of items) {
      await client.query(
        `INSERT INTO public.ecom_cart_items (cart_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, product_id) DO UPDATE SET
           quantity = EXCLUDED.quantity,
           updated_at = CURRENT_TIMESTAMP`,
        [cartId, item.productId, item.quantity],
      );
    }

    await client.query(
      "UPDATE public.ecom_carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [cartId],
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true, cartId, itemCount: items.length });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not sync persistent cart:", error);
    return NextResponse.json({ error: "Could not sync cart." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  const sessionToken = request.headers.get("x-cart-session") ||
    new URL(request.url).searchParams.get("sessionId");

  try {
    const pool = getEcommerceDbPool();
    let customerId: string | null = null;
    if (email) {
      const custRes = await pool.query<{ id: string }>(
        "SELECT id FROM public.ecom_customers WHERE LOWER(email) = $1",
        [email],
      );
      customerId = custRes.rows[0]?.id || null;
    }

    await pool.query(
      `UPDATE public.ecom_carts
       SET status = 'ABANDONED', updated_at = CURRENT_TIMESTAMP
       WHERE (ecom_customer_id = $1 OR session_token = $2) AND status = 'ACTIVE'`,
      [customerId, sessionToken],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Could not clear cart:", error);
    return NextResponse.json({ error: "Could not clear cart." }, { status: 500 });
  }
}

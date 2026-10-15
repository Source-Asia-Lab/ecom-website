import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import type { PoolClient } from "pg";
import { auth } from "@/auth";
import { INDIAN_STATES, validateCheckoutForm } from "../../checkout/checkout-utils";
import { getDbPool, getEcommerceDbPool } from "../../lib/db";
import { enqueueOrderNotification } from "../../lib/notification-outbox";
import {
  MAX_ORDER_SUBTOTAL,
  MAX_REQUEST_BYTES,
  parseOrderRequest,
} from "../../lib/order-request-validation";

interface CurrentProduct {
  id: string;
  name: string;
  sku: string;
  sale_price: string | number | null;
  default_gst_rate: string | number | null;
  stock_quantity: string | number;
}

function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    console.error("Could not roll back order request transaction:", error);
  }
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.ORDER_REQUESTS_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Order requests are temporarily unavailable." },
      { status: 503 },
    );
  }

  const requestText = await request.text();
  if (new TextEncoder().encode(requestText).byteLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Order request is too large." }, { status: 413 });
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(requestText);
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const submittedOrder = parseOrderRequest(rawBody);
  if (!submittedOrder) {
    return NextResponse.json({ error: "Please check the order details and try again." }, { status: 400 });
  }

  const { customer, lines } = submittedOrder;
  const session = await auth();
  const authenticatedEmail = session?.user?.email?.trim().toLowerCase() || null;
  const customerEmail = customer.email.trim().toLowerCase();
  if (authenticatedEmail && authenticatedEmail !== customerEmail) {
    return NextResponse.json(
      { error: "Use the email address from your signed-in Google account." },
      { status: 403 },
    );
  }

  const errors = validateCheckoutForm(customer, customer.shippingAddress === customer.billingAddress);
  if (Object.keys(errors).length > 0 || !INDIAN_STATES.includes(customer.state)) {
    return NextResponse.json({ error: "Please check the customer and address details." }, { status: 400 });
  }

  // Idempotency validation and request hash calculation
  const rawIdempotencyKey = request.headers.get("Idempotency-Key") || request.headers.get("idempotency-key");
  const idempotencyKey = rawIdempotencyKey ? rawIdempotencyKey.trim() : null;
  if (idempotencyKey !== null) {
    if (!/^[A-Za-z0-9_\-\.]{8,255}$/.test(idempotencyKey)) {
      return NextResponse.json(
        { error: "Invalid Idempotency-Key format. Must be 8-255 alphanumeric characters, dashes, or underscores." },
        { status: 400 },
      );
    }
  }

  const idempotencyScope = authenticatedEmail || customerEmail;
  const normalizedLines = [...lines]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map((l) => ({ productId: l.productId, quantity: l.quantity }));
  const normalizedPayload = JSON.stringify({
    customer: {
      email: customerEmail,
      contactPerson: customer.contactPerson.trim(),
      companyName: customer.companyName?.trim() || null,
      phone: customer.phone.trim(),
      shippingAddress: customer.shippingAddress.trim(),
      billingAddress: customer.billingAddress.trim(),
      state: customer.state.trim(),
    },
    lines: normalizedLines,
  });
  const requestHash = crypto.createHash("sha256").update(normalizedPayload).digest("hex");

  let client: PoolClient | undefined;
  try {
    client = await getEcommerceDbPool().connect();
    await client.query("BEGIN");

    // Check for existing idempotent order submission under advisory transaction lock
    if (idempotencyKey) {
      // Serialize concurrent requests with the identical idempotency key and scope
      // using transaction-scoped PostgreSQL advisory lock to prevent duplicate order creation races
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
        [idempotencyScope, idempotencyKey],
      );

      const existingIdempotency = await client.query<{
        id: string;
        request_hash: string;
        response_payload: Record<string, unknown>;
        status_code: number;
      }>(
        `SELECT id, request_hash, response_payload, status_code
         FROM public.ecom_order_idempotency
         WHERE idempotency_key = $1 AND scope = $2`,
        [idempotencyKey, idempotencyScope],
      );

      if (existingIdempotency.rows && existingIdempotency.rows.length > 0) {
        const record = existingIdempotency.rows[0];
        if (record.request_hash === requestHash) {
          await client.query("COMMIT");
          return NextResponse.json(record.response_payload, {
            status: record.status_code || 200,
            headers: { "Idempotent-Replayed": "true" },
          });
        } else {
          await rollback(client);
          return NextResponse.json(
            { error: "Idempotency key was reused with a materially different order request." },
            { status: 409 },
          );
        }
      }
    }

    // Deterministic ordering of product IDs to eliminate deadlocks
    const productIds = lines.map((line) => line.productId);
    const sortedProductIds = [...new Set(productIds)].sort();

    // Acquire row-level locks on product catalog rows inside the active transaction
    const publishedResult = await client.query<{
      product_id: string;
      name_override: string | null;
      price_override: string | number | null;
      stock_override: number | null;
    }>(
      `SELECT mapping.product_id, mapping.name_override,
              mapping.price_override, mapping.stock_override
       FROM public.ecom_product_catalog mapping
       JOIN public.ecom_categories category ON category.id = mapping.ecom_category_id
       WHERE mapping.product_id = ANY($1::uuid[])
         AND mapping.is_published = true
         AND category.is_active = true
       ORDER BY mapping.product_id ASC
       FOR UPDATE OF mapping`,
      [sortedProductIds],
    );
    const ecommerceCatalogByProductId = new Map(
      publishedResult.rows.map((row) => [row.product_id, row]),
    );
    const publishedProductIds = publishedResult.rows.map((row) => row.product_id);

    // Release expired holds within this client transaction
    await client.query(
      `UPDATE public.ecom_inventory_reservations
       SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'HOLD' AND expires_at <= CURRENT_TIMESTAMP`,
    );

    // Calculate active unexpired holds on the active transaction client
    const holdsResult = await client.query<{ product_id: string; held_quantity: string | number }>(
      `SELECT product_id, SUM(quantity) AS held_quantity
       FROM public.ecom_inventory_reservations
       WHERE status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP AND product_id = ANY($1::uuid[])
       GROUP BY product_id`,
      [sortedProductIds],
    );
    const activeHolds = new Map(holdsResult.rows.map((r) => [r.product_id, Number(r.held_quantity) || 0]));

    const productResult = await getDbPool().query<CurrentProduct>(
      `SELECT
         p.id,
         p.name,
         p.sku,
         p.sale_price,
         p.default_gst_rate,
         COALESCE(stock.total_quantity, 0) AS stock_quantity
       FROM public.products p
       LEFT JOIN (
         SELECT product_id, SUM(quantity) AS total_quantity
         FROM public.inventory_bin_stock
         WHERE product_id = ANY($2::uuid[])
         GROUP BY product_id
       ) stock ON stock.product_id = p.id
       WHERE p.id = ANY($1::uuid[])
         AND p.id = ANY($2::uuid[])
         AND p.is_active = true`,
      [publishedProductIds, productIds],
    );

    const currentProducts = new Map(productResult.rows.map((product) => {
      const catalogEntry = ecommerceCatalogByProductId.get(product.id);
      const baseStock = catalogEntry?.stock_override !== null && catalogEntry?.stock_override !== undefined
        ? Number(catalogEntry.stock_override)
        : Number(product.stock_quantity || 0);
      const heldQty = activeHolds.get(product.id) ?? 0;
      const effectiveStock = Math.max(0, baseStock - heldQty);

      return [
        product.id,
        {
          ...product,
          name: catalogEntry?.name_override ?? product.name,
          sale_price: catalogEntry?.price_override ?? product.sale_price,
          stock_quantity: effectiveStock,
        },
      ];
    }));
    if (currentProducts.size !== lines.length) {
      await rollback(client);
      return NextResponse.json(
        { error: "One or more products are no longer available for order requests." },
        { status: 409 },
      );
    }

    let subtotal = 0;
    let taxAmount = 0;
    let requiresTaxReview = false;
    const currentLines = [];

    for (const line of lines) {
      const product = currentProducts.get(line.productId);
      if (!product) {
        await rollback(client);
        return NextResponse.json({ error: "A requested product is unavailable." }, { status: 409 });
      }

      const unitPrice = Number(product.sale_price);
      const stockQuantity = Number(product.stock_quantity);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(stockQuantity)) {
        await rollback(client);
        return NextResponse.json(
          { error: `${product.name} is not available for online ordering. Please request a quote.` },
          { status: 409 },
        );
      }
      if (line.quantity > stockQuantity) {
        await rollback(client);
        return NextResponse.json(
          { error: `The available quantity for ${product.name} has changed. Please update your cart.` },
          { status: 409 },
        );
      }

      const lineSubtotal = roundMoney(unitPrice * line.quantity);
      subtotal = roundMoney(subtotal + lineSubtotal);
      const rawTaxRate = product.default_gst_rate;
      const taxRate = rawTaxRate === null ? Number.NaN : Number(rawTaxRate);
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        requiresTaxReview = true;
      } else {
        taxAmount = roundMoney(taxAmount + (lineSubtotal * taxRate / 100));
      }

      currentLines.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: line.quantity,
        unitPrice: roundMoney(unitPrice),
        lineSubtotal,
        taxRate: Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 100 ? taxRate : 0,
      });
    }

    if (!Number.isFinite(subtotal) || subtotal > MAX_ORDER_SUBTOTAL) {
      await rollback(client);
      return NextResponse.json({ error: "The order amount exceeds the supported limit." }, { status: 400 });
    }

    const billingAddressSnapshot = {
      companyName: customer.companyName,
      contactPerson: customer.contactPerson,
      email: customer.email,
      phone: customer.phone,
      gstin: customer.gstin || null,
      address: customer.billingAddress,
      state: customer.state,
      poNumber: customer.poNumber || null,
    };
    const shippingAddressSnapshot = {
      companyName: customer.companyName,
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      address: customer.shippingAddress,
      state: customer.state,
    };

    let ecommerceCustomerId: string | null = null;
    if (authenticatedEmail) {
      const customerNameParts = customer.contactPerson.trim().split(/\s+/);
      const customerResult = await client.query<{ id: string }>(
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
          authenticatedEmail,
          customerNameParts[0] || null,
          customerNameParts.slice(1).join(" ") || null,
          customer.phone,
          customer.companyName,
          customer.gstin || null,
        ],
      );
      ecommerceCustomerId = customerResult.rows[0].id;
    }

    const note = [
      "Customer-submitted order request; not yet confirmed and no inventory reserved.",
      requiresTaxReview ? "Tax rate requires review before the final quote." : null,
      customer.poNumber ? `PO Number: ${customer.poNumber}` : null,
    ].filter(Boolean).join(" ");

    const orderResult = await client.query<{ id: string; order_number: string }>(
      `INSERT INTO public.ecom_orders (
        ecom_customer_id,
         status,
         currency,
         subtotal,
         tax_amount,
         total_amount,
         billing_address_snapshot,
         shipping_address_snapshot,
         payment_status,
         notes
       )
       VALUES ($1, 'PENDING', 'INR', $2, $3, $4, $5::jsonb, $6::jsonb, 'PENDING', $7)
       RETURNING id, order_number`,
      [
        ecommerceCustomerId,
        subtotal,
        requiresTaxReview ? 0 : taxAmount,
        roundMoney(subtotal + (requiresTaxReview ? 0 : taxAmount)),
        JSON.stringify(billingAddressSnapshot),
        JSON.stringify(shippingAddressSnapshot),
        note,
      ],
    );

    const order = orderResult.rows[0];
    const holdExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    for (const line of currentLines) {
      await client.query(
        `INSERT INTO public.ecom_order_items (
           ecom_order_id,
           product_id,
           product_name_snapshot,
           sku_snapshot,
           quantity,
           unit_price,
           tax_rate,
           line_total
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          order.id,
          line.productId,
          line.name,
          line.sku,
          line.quantity,
          line.unitPrice,
          line.taxRate,
          line.lineSubtotal,
        ],
      );

      // Create 10-minute inventory reservation hold
      await client.query(
        `INSERT INTO public.ecom_inventory_reservations (
           product_id, order_id, quantity, status, expires_at
         )
         VALUES ($1, $2, $3, 'HOLD', $4)`,
        [line.productId, order.id, line.quantity, holdExpiresAt],
      );
    }

    await enqueueOrderNotification(client, {
      eventKey: `order-received:${order.id}`,
      eventType: "ORDER_RECEIVED",
      orderId: order.id,
      orderNumber: order.order_number,
      email: customer.email,
      phone: customer.phone,
      customerName: customer.contactPerson,
      message: "We received your order request. Inventory is temporarily reserved for 10 minutes pending payment/confirmation.",
      status: "PENDING",
    });
    await enqueueOrderNotification(client, {
      eventKey: `order-received-staff:${order.id}`,
      eventType: "ORDER_RECEIVED",
      orderId: order.id,
      orderNumber: order.order_number,
      email: process.env.NOTIFICATION_ORDERS_EMAIL,
      customerName: customer.companyName,
      message: `New pending request from ${customer.contactPerson} (${customer.email}), ${customer.phone}.`,
      status: "PENDING",
    });

    const responsePayload = {
      orderId: order.id,
      orderNumber: order.order_number,
      subtotal,
      taxAmount: requiresTaxReview ? null : taxAmount,
      total: requiresTaxReview ? null : roundMoney(subtotal + taxAmount),
      requiresTaxReview,
      status: "PENDING",
      paymentStatus: "PENDING",
      inventoryReserved: true,
      expiresAt: holdExpiresAt.toISOString(),
    };

    if (idempotencyKey) {
      await client.query(
        `INSERT INTO public.ecom_order_idempotency (
           idempotency_key, scope, request_hash, ecom_order_id, response_payload, status_code
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, 201)
         ON CONFLICT (idempotency_key, scope) DO NOTHING`,
        [idempotencyKey, idempotencyScope, requestHash, order.id, JSON.stringify(responsePayload)],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    if (client) {
      await rollback(client);
    }
    console.error("Order request could not be saved:", error);
    return NextResponse.json(
      { error: "We could not submit the order request. Please try again later." },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}

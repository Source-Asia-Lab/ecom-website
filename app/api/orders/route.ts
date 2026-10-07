import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { INDIAN_STATES, validateCheckoutForm } from "../../checkout/checkout-utils";
import { getDbPool } from "../../lib/db";
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
  const errors = validateCheckoutForm(customer, customer.shippingAddress === customer.billingAddress);
  if (Object.keys(errors).length > 0 || !INDIAN_STATES.includes(customer.state)) {
    return NextResponse.json({ error: "Please check the customer and address details." }, { status: 400 });
  }

  let client: PoolClient | undefined;
  try {
    client = await getDbPool().connect();
    await client.query("BEGIN");

    const productIds = lines.map((line) => line.productId);
    const productResult = await client.query<CurrentProduct>(
      `SELECT
         p.id,
         p.name,
         p.sku,
         p.sale_price,
         p.default_gst_rate,
         COALESCE(stock.total_quantity, 0) AS stock_quantity
       FROM public.products p
       JOIN public.ecom_product_catalog mapping
         ON mapping.product_id = p.id AND mapping.is_published = true
       JOIN public.ecom_categories category
         ON category.id = mapping.ecom_category_id AND category.is_active = true
       LEFT JOIN (
         SELECT product_id, SUM(quantity) AS total_quantity
         FROM public.inventory_bin_stock
         WHERE product_id = ANY($1::uuid[])
         GROUP BY product_id
       ) stock ON stock.product_id = p.id
       WHERE p.id = ANY($1::uuid[])
         AND p.is_active = true`,
      [productIds],
    );

    const currentProducts = new Map(productResult.rows.map((product) => [product.id, product]));
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
    const note = [
      "Customer-submitted order request; not yet confirmed and no inventory reserved.",
      requiresTaxReview ? "Tax rate requires review before the final quote." : null,
      customer.poNumber ? `PO Number: ${customer.poNumber}` : null,
    ].filter(Boolean).join(" ");

    const orderResult = await client.query<{ id: string; order_number: string }>(
      `INSERT INTO public.ecom_orders (
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
       VALUES ('PENDING', 'INR', $1, $2, $3, $4::jsonb, $5::jsonb, 'PENDING', $6)
       RETURNING id, order_number`,
      [
        subtotal,
        requiresTaxReview ? 0 : taxAmount,
        roundMoney(subtotal + (requiresTaxReview ? 0 : taxAmount)),
        JSON.stringify(billingAddressSnapshot),
        JSON.stringify(shippingAddressSnapshot),
        note,
      ],
    );

    const order = orderResult.rows[0];
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
    }

    await client.query("COMMIT");
    return NextResponse.json(
      {
        orderNumber: order.order_number,
        subtotal,
        taxAmount: requiresTaxReview ? null : taxAmount,
        total: requiresTaxReview ? null : roundMoney(subtotal + taxAmount),
        requiresTaxReview,
        status: "PENDING",
        paymentStatus: "PENDING",
        inventoryReserved: false,
      },
      { status: 201 },
    );
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

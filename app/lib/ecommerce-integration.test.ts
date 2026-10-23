import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import type { Pool, PoolClient } from "pg";
import { NextRequest } from "next/server";
import { getDbPool, getEcommerceDbPool } from "./db";
import {
  applyMigrationsToTestDatabase, closeTestEcommerceDbPool, getTestEcommerceDbPool,
  getValidatedTestDatabaseUrl, preflightTestDatabase, resetTestDatabaseTables,
} from "./test-database";
import { createOrderRequestHandler } from "./order-request-service";
import { linkGuestOrdersToCustomer } from "./account-linking";
import { processPaymentConfirmationTransaction } from "./razorpay-service";
import { verifyBankTransferTransaction } from "./bank-transfer-verification";
import { generateTransferReference, isValidUtr } from "./bank-transfer-service";
import { processStaffOrderStatusTransition } from "../api/admin/orders/route";

// All clients, including the product-data reader, use the same verified test pool.
// No fetch/SQL mocks, application database pools, or gateway requests are used.
const syntheticDomain = "sourceasia-integration.invalid";
let pool: Pool;
let guard: PoolClient | undefined;
let prepared = false;
let categoryId: string;
let migrations: string[] = [];

function buyer(email = `buyer-${randomUUID()}@${syntheticDomain}`) {
  return { companyName: "Integration Synthetic Company", contactPerson: "Integration Buyer", email,
    phone: "9999999999", gstin: "", shippingAddress: "Synthetic test address, never deliver",
    billingAddress: "Synthetic test address, never deliver", state: "Karnataka", poNumber: "INTEGRATION" };
}

const submitOrder = createOrderRequestHandler({
  getEcommercePool: () => pool,
  getProductPool: () => pool,
  getAuthenticatedEmail: async () => null, // Explicit guest context; no OAuth/network calls.
});

async function submit(productId: string, options: { quantity?: number; key?: string; email?: string; raw?: unknown } = {}) {
  const payload = options.raw ?? { customer: buyer(options.email), lines: [{ productId, quantity: options.quantity ?? 1 }] };
  const response = await submitOrder(new NextRequest("https://sourceasia-integration.invalid/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json", ...(options.key ? { "Idempotency-Key": options.key } : {}) },
    body: JSON.stringify(payload),
  }));
  const body = await response.json() as { orderId?: string; orderNumber?: string; status?: string; paymentStatus?: string; error?: string };
  return { response, body };
}

async function seedProduct(stock = 5): Promise<string> {
  const id = randomUUID();
  await pool.query(`INSERT INTO public.products (id,name,sku,sale_price,default_gst_rate,is_active)
    VALUES ($1,'Integration synthetic product',$2,100,18,true)`, [id, `INTEGRATION-${id}`]);
  await pool.query("INSERT INTO public.inventory_bin_stock (product_id,quantity) VALUES ($1,$2)", [id, stock]);
  await pool.query(`INSERT INTO public.ecom_product_catalog
    (product_id,ecom_category_id,is_published,stock_override,name_override,price_override)
    VALUES ($1,$2,true,$3,'Integration synthetic product',100)`, [id, categoryId, stock]);
  return id;
}

async function count(table: string): Promise<number> {
  assert.match(table, /^(ecom_[a-z_]+|products|inventory_bin_stock)$/);
  return (await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.${table}`)).rows[0].count;
}

async function cleanFixtures() {
  await resetTestDatabaseTables(pool);
  await pool.query("DELETE FROM public.ecom_product_catalog");
  await pool.query("DELETE FROM public.inventory_bin_stock");
  await pool.query("DELETE FROM public.products");
}

async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function createOrder(stock = 5) {
  const productId = await seedProduct(stock);
  const created = await submit(productId);
  assert.equal(created.response.status, 201, "The real application order workflow must commit successfully");
  assert.ok(created.body.orderId && created.body.orderNumber);
  return { productId, orderId: created.body.orderId, orderNumber: created.body.orderNumber };
}

async function paymentFixture(orderId: string) {
  const gatewayOrderId = `integration-order-${randomUUID()}`;
  await pool.query(`INSERT INTO public.ecom_payments (ecom_order_id,razorpay_order_id,amount,currency,status)
    VALUES ($1,$2,118,'INR','CREATED')`, [orderId, gatewayOrderId]);
  return gatewayOrderId;
}

async function confirmPayment(order: { orderId: string; orderNumber: string }, gatewayOrderId: string) {
  return transaction(client => processPaymentConfirmationTransaction({
    client, ...order, razorpayOrderId: gatewayOrderId, paymentId: `integration-payment-${order.orderId}`,
    signature: "synthetic-fixture-no-gateway-verification", method: "UPI", isSimulated: true,
  }));
}

async function transition(orderNumber: string, status: string) {
  return transaction(client => processStaffOrderStatusTransition({
    orderNumber, status, staffEmail: `staff@${syntheticDomain}`,
    carrierName: "Integration Synthetic Carrier", awbNumber: "INTEGRATION-AWB",
    trackingUrl: "https://sourceasia-integration.invalid/tracking",
  }, client, (sql, params) => client.query(sql, params)));
}

async function schemaFingerprint() {
  return (await pool.query(`SELECT pg_catalog.pg_get_constraintdef(oid) AS definition
    FROM pg_catalog.pg_constraint WHERE conrelid='public.ecom_order_idempotency'::regclass ORDER BY definition`)).rows;
}

describe("Real PostgreSQL integration: dedicated Source Asia test database", { concurrency: false, timeout: 180000 }, () => {
  before(async () => {
    assert.equal(process.env.SOURCEASIA_INTEGRATION_TESTS, "true", "Run with the integration preload isolation guard");
    getValidatedTestDatabaseUrl(); // No missing-configuration skip or fallback.
    pool = getTestEcommerceDbPool();
    await preflightTestDatabase();
    guard = await pool.connect();
    const lock = await guard.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext('sourceasia-real-integration-suite')) AS locked");
    assert.equal(lock.rows[0].locked, true, "Another integration suite is using this database; stop");
    const activity = await guard.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_catalog.pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid() AND xact_start IS NOT NULL AND backend_type='client backend'`);
    assert.equal(activity.rows[0].count, 0, "Another transaction is using the dedicated test database; stop");

    // Migration 007 is safe to reapply only when any existing table is compatible.
    const columns = await guard.query<{ column_name: string; data_type: string }>(`SELECT column_name,data_type
      FROM information_schema.columns WHERE table_schema='public' AND table_name='ecom_order_idempotency'`);
    if (columns.rows.length) {
      const required = { id: "uuid", idempotency_key: "character varying", scope: "character varying",
        request_hash: "character varying", ecom_order_id: "uuid", response_payload: "jsonb",
        status_code: "integer", created_at: "timestamp with time zone", updated_at: "timestamp with time zone" };
      for (const [name, type] of Object.entries(required)) {
        assert.equal(columns.rows.find(c => c.column_name === name)?.data_type, type, "Existing migration 007 schema is incompatible; stop");
      }
      const constraints = await schemaFingerprint();
      assert.ok(constraints.some(c => c.definition === "UNIQUE (idempotency_key, scope)"));
      assert.ok(constraints.some(c => c.definition.includes("FOREIGN KEY (ecom_order_id) REFERENCES ecom_orders(id) ON DELETE CASCADE")));
    }
    migrations = await applyMigrationsToTestDatabase(pool);
    // These two tiny fixture tables exist exclusively inside the dedicated test database.
    // Production product-read SQL runs unchanged against synthetic PostgreSQL records.
    await pool.query(`CREATE TABLE IF NOT EXISTS public.products (
      id uuid PRIMARY KEY, name text NOT NULL, sku varchar(100) NOT NULL CHECK (sku LIKE 'INTEGRATION-%'),
      sale_price numeric(15,2) NOT NULL, default_gst_rate numeric(5,2), is_active boolean NOT NULL);
      CREATE TABLE IF NOT EXISTS public.inventory_bin_stock (
      product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
      quantity numeric(15,3) NOT NULL CHECK (quantity>=0));`);
    const category = await pool.query<{ id: string }>(`INSERT INTO public.ecom_categories (name,slug,is_active)
      VALUES ('Integration synthetic category','integration-synthetic',true)
      ON CONFLICT (slug) DO UPDATE SET is_active=true RETURNING id`);
    categoryId = category.rows[0].id;
    prepared = true;
  });

  beforeEach(async () => { await cleanFixtures(); });
  after(async () => {
    try {
      if (prepared) {
        await cleanFixtures();
        await pool.query("DELETE FROM public.ecom_categories WHERE id=$1 AND slug='integration-synthetic'", [categoryId]);
      }
    } finally {
      if (guard) {
        await guard.query("SELECT pg_advisory_unlock(hashtext('sourceasia-real-integration-suite'))").catch(() => {});
        guard.release();
      }
      await closeTestEcommerceDbPool();
    }
  });

  test("01 connection, SSL, migrations 001-007 and application schema", async () => {
    const identity = await preflightTestDatabase();
    assert.equal(identity.database, "sourceasia_ecom_test"); assert.equal(identity.ssl, true);
    assert.equal(migrations.length, 8);
    assert.equal(migrations[6], "007_add_order_idempotency.sql");
    assert.equal(migrations[7], "008_add_bank_transfer_payments.sql");
    const tables = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'ecom_%' AND table_type='BASE TABLE'`);
    assert.equal(tables.rows[0].count, 19);
    const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='ecom_order_idempotency'");
    assert.ok(indexes.rows.some(i => i.indexname === "idx_ecom_order_idempotency_key_scope"));
  });

  test("02 migration 007 reapplies idempotently without changing constraints", async () => {
    const before = await schemaFingerprint();
    const client = await pool.connect();
    try { await client.query(fs.readFileSync(path.resolve("db/migrations/007_add_order_idempotency.sql"), "utf8")); }
    finally { client.release(); }
    assert.deepEqual(await schemaFingerprint(), before);
    assert.equal(await count("ecom_order_idempotency"), 0);
  });

  test("03 real order request commits order, line, hold and notification outbox", async () => {
    const order = await createOrder();
    const stored = await pool.query("SELECT status,payment_status,total_amount FROM public.ecom_orders WHERE id=$1", [order.orderId]);
    assert.equal(stored.rows[0].status, "PENDING"); assert.equal(stored.rows[0].payment_status, "PENDING");
    assert.equal(Number(stored.rows[0].total_amount), 118);
    assert.equal(await count("ecom_order_items"), 1); assert.equal(await count("ecom_inventory_reservations"), 1);
    assert.ok(await count("ecom_notification_outbox") >= 2);
  });

  test("04 PostgreSQL rollback leaves no partial order or line", async () => {
    const product = await seedProduct(); const client = await pool.connect(); let id = "";
    try {
      await client.query("BEGIN");
      const order = await client.query(`INSERT INTO public.ecom_orders (shipping_address_snapshot,billing_address_snapshot)
        VALUES ('{}'::jsonb,'{}'::jsonb) RETURNING id`);
      id = order.rows[0].id;
      await client.query(`INSERT INTO public.ecom_order_items (ecom_order_id,product_id,product_name_snapshot,sku_snapshot)
        VALUES ($1,$2,'Integration rollback product','INTEGRATION-ROLLBACK')`, [id, product]);
      await client.query("ROLLBACK");
    } finally { await client.query("ROLLBACK").catch(() => {}); client.release(); }
    assert.equal((await pool.query("SELECT id FROM public.ecom_orders WHERE id=$1", [id])).rowCount, 0);
    assert.equal(await count("ecom_order_items"), 0);
  });

  test("05 concurrent real checkouts reserve the last unit exactly once", async () => {
    const product = await seedProduct(1);
    const results = await Promise.all([submit(product), submit(product)]);
    assert.deepEqual(results.map(r => r.response.status).sort(), [201, 409]);
    assert.equal(await count("ecom_orders"), 1);
    const holds = await pool.query("SELECT sum(quantity) AS quantity FROM public.ecom_inventory_reservations WHERE status='HOLD'");
    assert.equal(Number(holds.rows[0].quantity), 1);
  });

  test("06 request retries replay the committed order without duplicates", async () => {
    const product = await seedProduct(); const key = `integration-${randomUUID()}`; const email = buyer().email;
    const first = await submit(product, { key, email }); const retry = await submit(product, { key, email });
    assert.equal(first.response.status, 201); assert.equal(retry.response.status, 201);
    assert.equal(retry.response.headers.get("Idempotent-Replayed"), "true");
    assert.deepEqual(retry.body, first.body);
    for (const table of ["ecom_orders", "ecom_order_items", "ecom_inventory_reservations", "ecom_order_idempotency"]) assert.equal(await count(table), 1);
  });

  test("07 concurrent duplicate requests serialize through real advisory locks", async () => {
    const product = await seedProduct(1); const key = `integration-${randomUUID()}`; const email = buyer().email;
    const results = await Promise.all([submit(product, { key, email }), submit(product, { key, email })]);
    assert.ok(results.every(r => r.response.status === 201));
    assert.equal(results[0].body.orderId, results[1].body.orderId);
    assert.equal(results.filter(r => r.response.headers.get("Idempotent-Replayed") === "true").length, 1);
    assert.equal(await count("ecom_orders"), 1); assert.equal(await count("ecom_order_idempotency"), 1);
  });

  test("08 reusing an idempotency key for a different request returns 409", async () => {
    const product = await seedProduct(); const key = `integration-${randomUUID()}`; const email = buyer().email;
    assert.equal((await submit(product, { key, email })).response.status, 201);
    assert.equal((await submit(product, { key, email, quantity: 2 })).response.status, 409);
    assert.equal(await count("ecom_orders"), 1);
  });

  test("09 checkout releases expired holds and preserves consistent availability", async () => {
    const product = await seedProduct(1);
    assert.equal((await submit(product)).response.status, 201);
    await pool.query("UPDATE public.ecom_inventory_reservations SET expires_at=CURRENT_TIMESTAMP-interval '1 minute'");
    assert.equal((await submit(product)).response.status, 201);
    const status = await pool.query("SELECT status,count(*)::int AS count FROM public.ecom_inventory_reservations GROUP BY status ORDER BY status");
    assert.deepEqual(status.rows, [{ status: "HOLD", count: 1 }, { status: "RELEASED", count: 1 }]);
    assert.equal((await submit(product)).response.status, 409);
    const stock = await pool.query("SELECT stock_override FROM public.ecom_product_catalog WHERE product_id=$1", [product]);
    assert.equal(stock.rows[0].stock_override, 1);
  });

  test("10 guest linking requires verification and cannot reassign an owned order", async () => {
    const email = buyer().email; const product = await seedProduct();
    const order = await submit(product, { email }); assert.equal(order.response.status, 201);
    const customers = await pool.query(`INSERT INTO public.ecom_customers (email,first_name)
      VALUES ($1,'Integration Buyer'),($2,'Integration Other') RETURNING id`, [email, buyer().email]);
    await transaction(async client => {
      const options = { email, customerId: customers.rows[0].id, isEmailVerified: false };
      assert.equal((await linkGuestOrdersToCustomer(options, client)).success, false);
      const linked = await linkGuestOrdersToCustomer({ ...options, isEmailVerified: true }, client);
      assert.equal(linked.linkedCount, 1);
      assert.equal((await linkGuestOrdersToCustomer({ ...options, isEmailVerified: true }, client)).linkedCount, 0);
      assert.equal((await linkGuestOrdersToCustomer({ ...options, isEmailVerified: true, customerId: customers.rows[1].id }, client)).linkedCount, 0);
    });
    assert.equal((await pool.query("SELECT ecom_customer_id FROM public.ecom_orders WHERE id=$1", [order.body.orderId])).rows[0].ecom_customer_id, customers.rows[0].id);
    assert.equal(await count("ecom_audit_log"), 1);
  });

  test("11 payment transaction confirms once and deducts stock once (synthetic event, no gateway)", async () => {
    const order = await createOrder(3); const payment = await paymentFixture(order.orderId);
    assert.equal((await confirmPayment(order, payment)).success, true);
    assert.equal((await confirmPayment(order, payment)).alreadyPaid, true);
    const state = await pool.query("SELECT status,payment_status FROM public.ecom_orders WHERE id=$1", [order.orderId]);
    assert.deepEqual(state.rows[0], { status: "CONFIRMED", payment_status: "PAID" });
    assert.equal((await pool.query("SELECT stock_override FROM public.ecom_product_catalog WHERE product_id=$1", [order.productId])).rows[0].stock_override, 2);
    assert.equal((await pool.query("SELECT status FROM public.ecom_payments WHERE ecom_order_id=$1", [order.orderId])).rows[0].status, "CAPTURED");
    assert.equal(await count("ecom_audit_log"), 1);
  });

  test("12 staff confirmation rejects unpaid and unverified-payment orders", async () => {
    const order = await createOrder();
    const unpaid = await transition(order.orderNumber, "CONFIRMED");
    assert.equal(unpaid.success, false); if (!unpaid.success) assert.equal(unpaid.statusCode, 422);
    await pool.query("UPDATE public.ecom_orders SET payment_status='PAID' WHERE id=$1", [order.orderId]);
    const unverified = await transition(order.orderNumber, "CONFIRMED");
    assert.equal(unverified.success, false); if (!unverified.success) assert.equal(unverified.statusCode, 422);
    assert.equal((await pool.query("SELECT status FROM public.ecom_orders WHERE id=$1", [order.orderId])).rows[0].status, "PENDING");
    assert.equal(await count("ecom_audit_log"), 0);
  });

  test("13 late payment enters review without confirming or decrementing stock", async () => {
    const order = await createOrder(2); const payment = await paymentFixture(order.orderId);
    await pool.query("UPDATE public.ecom_inventory_reservations SET expires_at=CURRENT_TIMESTAMP-interval '1 minute'");
    const result = await confirmPayment(order, payment);
    assert.equal(result.success, false); assert.equal(result.holdExpired, true); assert.equal(result.status, "PAYMENT_REVIEW");
    assert.equal((await pool.query("SELECT stock_override FROM public.ecom_product_catalog WHERE product_id=$1", [order.productId])).rows[0].stock_override, 2);
    assert.equal((await pool.query("SELECT status FROM public.ecom_orders WHERE id=$1", [order.orderId])).rows[0].status, "PAYMENT_REVIEW");
  });

  test("14 shipment lifecycle updates one record and rejects duplicate transitions", async () => {
    const order = await createOrder(); await confirmPayment(order, await paymentFixture(order.orderId));
    let shipmentId: string | undefined;
    for (const status of ["PROCESSING", "PACKAGED", "IN_TRANSIT", "DELIVERED"]) {
      assert.equal((await transition(order.orderNumber, status)).success, true);
      if (status === "PROCESSING") continue;
      const shipment = await pool.query("SELECT id,status,shipped_at,delivered_at FROM public.ecom_shipments WHERE ecom_order_id=$1", [order.orderId]);
      assert.equal(shipment.rows.length, 1);
      shipmentId ??= shipment.rows[0].id; assert.equal(shipment.rows[0].id, shipmentId);
      assert.equal(shipment.rows[0].status, status);
      if (status === "DELIVERED") { assert.ok(shipment.rows[0].shipped_at); assert.ok(shipment.rows[0].delivered_at); }
    }
    assert.equal((await transition(order.orderNumber, "DELIVERED")).success, false);
    assert.equal(await count("ecom_shipments"), 1);
  });

  test("15 concurrent packaging creates a single shipment under the real order lock", async () => {
    const order = await createOrder(); await confirmPayment(order, await paymentFixture(order.orderId));
    assert.equal((await transition(order.orderNumber, "PROCESSING")).success, true);
    const results = await Promise.all([transition(order.orderNumber, "PACKAGED"), transition(order.orderNumber, "PACKAGED")]);
    assert.equal(results.filter(r => r.success).length, 1); assert.equal(await count("ecom_shipments"), 1);
  });

  test("16 PostgreSQL rejects foreign-key, check and unique-constraint violations", async () => {
    const product = await seedProduct();
    await assert.rejects(pool.query(`INSERT INTO public.ecom_inventory_reservations (product_id,quantity,expires_at)
      VALUES ($1,0,CURRENT_TIMESTAMP)`, [product]), { code: "23514" });
    await assert.rejects(pool.query("UPDATE public.ecom_product_catalog SET stock_override=-1 WHERE product_id=$1", [product]), { code: "23514" });
    await assert.rejects(pool.query(`INSERT INTO public.ecom_order_items (ecom_order_id,product_id,product_name_snapshot,sku_snapshot)
      VALUES ($1,$2,'Integration invalid FK','INTEGRATION-INVALID')`, [randomUUID(), product]), { code: "23503" });
    await pool.query("INSERT INTO public.ecom_customers (email) VALUES ($1)", [`unique@${syntheticDomain}`]);
    await assert.rejects(pool.query("INSERT INTO public.ecom_customers (email) VALUES ($1)", [`unique@${syntheticDomain}`]), { code: "23505" });
    const order = await submit(product); assert.equal(order.response.status, 201);
    await assert.rejects(pool.query(`INSERT INTO public.ecom_payments (ecom_order_id,razorpay_order_id,amount)
      VALUES ($1,'integration-invalid-amount',-1)`, [order.body.orderId]), { code: "23514" });
  });

  test("17 invalid real order requests leave no order, hold or idempotency record", async () => {
    const product = await seedProduct();
    for (const quantity of [0, -1, 1.5, 501]) assert.equal((await submit(product, { quantity })).response.status, 400);
    assert.equal((await submit(product, { key: "short" })).response.status, 400);
    assert.equal((await submit(randomUUID())).response.status, 409);
    for (const table of ["ecom_orders", "ecom_inventory_reservations", "ecom_order_idempotency"]) assert.equal(await count(table), 0);
  });

  test("18 bank transfer: UTR submission, verification, and rejection flows", async () => {
    // A. Create order + bank transfer record (as the order route would)
    const order = await createOrder();
    const reference = generateTransferReference(order.orderNumber);
    assert.ok(isValidUtr("N12345678901"));
    await pool.query(
      `INSERT INTO public.ecom_payments (ecom_order_id,gateway,razorpay_order_id,amount,currency,status,method)
       VALUES ($1,'BANK_TRANSFER',$2,118,'INR','CREATED','BANK_TRANSFER')`,
      [order.orderId, reference],
    );

    // B. Customer submits a UTR -> PENDING_VERIFICATION, nothing auto-confirms
    const utr = "N12345678901";
    await pool.query(
      "UPDATE public.ecom_payments SET utr_reference=$2, status='PENDING_VERIFICATION' WHERE razorpay_order_id=$1",
      [reference, utr],
    );
    const pre = await pool.query("SELECT status FROM public.ecom_orders WHERE id=$1", [order.orderId]);
    assert.equal(pre.rows[0].status, "PENDING", "UTR submission must not auto-confirm the order");

    // C. Staff confirm -> order CONFIRMED/PAID, stock decremented, holds committed
    const confirmed = await transaction(client => verifyBankTransferTransaction({
      client, orderNumber: order.orderNumber, utr, staffEmail: `staff@${syntheticDomain}`, action: "confirm",
    }));
    assert.equal(confirmed.success, true);
    const post = await pool.query("SELECT status,payment_status FROM public.ecom_orders WHERE id=$1", [order.orderId]);
    assert.deepEqual(post.rows[0], { status: "CONFIRMED", payment_status: "PAID" });
    assert.equal((await pool.query("SELECT stock_override FROM public.ecom_product_catalog WHERE product_id=$1", [order.productId])).rows[0].stock_override, 4);
    assert.equal((await pool.query("SELECT status FROM public.ecom_payments WHERE razorpay_order_id=$1", [reference])).rows[0].status, "CAPTURED");

    // D. Double verification is rejected (idempotent safety)
    const again = await transaction(client => verifyBankTransferTransaction({
      client, orderNumber: order.orderNumber, utr, staffEmail: `staff@${syntheticDomain}`, action: "confirm",
    }));
    assert.equal(again.success, false);

    // E. Rejection flow on a fresh order
    const order2 = await createOrder();
    const ref2 = generateTransferReference(order2.orderNumber);
    await pool.query(
      `INSERT INTO public.ecom_payments (ecom_order_id,gateway,razorpay_order_id,amount,currency,status,method)
       VALUES ($1,'BANK_TRANSFER',$2,118,'INR','CREATED','BANK_TRANSFER')`,
      [order2.orderId, ref2],
    );
    const utr2 = "R98765432109";
    await pool.query(
      "UPDATE public.ecom_payments SET utr_reference=$2, status='PENDING_VERIFICATION' WHERE razorpay_order_id=$1",
      [ref2, utr2],
    );
    const rejected = await transaction(client => verifyBankTransferTransaction({
      client, orderNumber: order2.orderNumber, utr: utr2, staffEmail: `staff@${syntheticDomain}`, action: "reject",
    }));
    assert.equal(rejected.success, true);
    const after2 = await pool.query("SELECT status,payment_status FROM public.ecom_orders WHERE id=$1", [order2.orderId]);
    assert.equal(after2.rows[0].payment_status, "PENDING", "rejection must not mark the order paid");
    assert.equal((await pool.query("SELECT status FROM public.ecom_payments WHERE razorpay_order_id=$1", [ref2])).rows[0].status, "FAILED");

    // F. Wrong UTR is rejected
    const wrong = await transaction(client => verifyBankTransferTransaction({
      client, orderNumber: order2.orderNumber, utr: "N00000000000", staffEmail: `staff@${syntheticDomain}`, action: "confirm",
    }));
    assert.equal(wrong.success, false);
  });

  test("19 cleanup removes synthetic transactional data and application pools remain blocked", async () => {
    await createOrder(); assert.equal(await count("ecom_orders"), 1);
    await cleanFixtures();
    for (const table of ["ecom_orders", "ecom_order_items", "ecom_customers", "ecom_payments", "ecom_shipments",
      "ecom_inventory_reservations", "ecom_notification_outbox", "ecom_audit_log", "ecom_order_idempotency", "products", "inventory_bin_stock", "ecom_product_catalog"]) {
      assert.equal(await count(table), 0);
    }
    assert.throws(getDbPool, /disabled in integration tests/);
    assert.throws(getEcommerceDbPool, /disabled in integration tests/);
    assert.equal((await preflightTestDatabase()).database, "sourceasia_ecom_test");
  });
});

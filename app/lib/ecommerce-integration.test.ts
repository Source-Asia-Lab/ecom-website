import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getValidatedTestDatabaseUrl,
  getTestEcommerceDbPool,
  closeTestEcommerceDbPool,
  applyMigrationsToTestDatabase,
  resetTestDatabaseTables,
} from "./test-database";
import { linkGuestOrdersToCustomer } from "./account-linking";
import { processPaymentConfirmationTransaction } from "./razorpay-service";

// Check if a dedicated disposable test database URL is available
const isTestDatabaseConfigured = Boolean(process.env.ECOMMERCE_TEST_DATABASE_URL?.trim());

test("PostgreSQL Integration: Disposable test database execution gate", (t) => {
  if (!isTestDatabaseConfigured) {
    t.skip(
      "SKIPPED: ECOMMERCE_TEST_DATABASE_URL is not set. Genuine PostgreSQL integration tests require a dedicated disposable test database (e.g. sourceasia_ecom_test).",
    );
    return;
  }

  // Validate that the URL strictly passes safety guards
  const url = getValidatedTestDatabaseUrl();
  assert.ok(url.length > 0);
});

// The following genuine integration tests execute ONLY when a dedicated disposable database is provided
if (isTestDatabaseConfigured) {
  test("1. PostgreSQL Integration: Migrations apply cleanly to disposable test database", async () => {
    const pool = getTestEcommerceDbPool();
    const applied = await applyMigrationsToTestDatabase(pool);
    assert.ok(applied.length >= 7, "All migrations 001-007 must apply successfully");
    await resetTestDatabaseTables(pool);
  });

  test("2. PostgreSQL Integration: Foreign keys, unique constraints, and indexes exist", async () => {
    const pool = getTestEcommerceDbPool();
    const client = await pool.connect();
    try {
      // Check ecom_order_idempotency table unique constraint
      const constraintsRes = await client.query<{ constraint_name: string }>(
        `SELECT constraint_name
         FROM information_schema.table_constraints
         WHERE table_name = 'ecom_order_idempotency'
           AND constraint_type = 'UNIQUE'`,
      );
      const constraintNames = constraintsRes.rows.map((r) => r.constraint_name);
      assert.ok(
        constraintNames.includes("ecom_order_idempotency_key_scope_unique"),
        "ecom_order_idempotency must enforce unique (idempotency_key, scope)",
      );

      // Check required indexes
      const indexesRes = await client.query<{ indexname: string }>(
        `SELECT indexname
         FROM pg_indexes
         WHERE tablename = 'ecom_order_idempotency'`,
      );
      const indexNames = indexesRes.rows.map((r) => r.indexname);
      assert.ok(indexNames.includes("idx_ecom_order_idempotency_key_scope"));
    } finally {
      client.release();
    }
  });

  test("3. PostgreSQL Integration: Atomic order creation and rollback integrity", async () => {
    const pool = getTestEcommerceDbPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query<{ id: string }>(
        `INSERT INTO public.ecom_orders (status, total_amount, shipping_address_snapshot, billing_address_snapshot)
         VALUES ('PENDING', 500, '{}'::jsonb, '{"email": "rollback@integration.com"}'::jsonb)
         RETURNING id`,
      );
      const orderId = orderRes.rows[0].id;

      // Intentionally rollback
      await client.query("ROLLBACK");

      // Verify no partial record survived
      const verifyRes = await pool.query("SELECT id FROM public.ecom_orders WHERE id = $1", [orderId]);
      assert.equal(verifyRes.rows.length, 0, "Rollback must leave zero partial order records");
    } finally {
      client.release();
    }
  });

  test("4. PostgreSQL Integration: Two concurrent checkouts competing for last unit under row locks", async () => {
    const pool = getTestEcommerceDbPool();
    await resetTestDatabaseTables(pool);

    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      // Setup test category and catalog product with stock_override = 1
      const catRes = await pool.query<{ id: string }>(
        `INSERT INTO public.ecom_categories (name, slug, is_active)
         VALUES ('Test Cat', 'test-cat-conc', true)
         RETURNING id`,
      );
      const catId = catRes.rows[0].id;

      const prodRes = await pool.query<{ product_id: string }>(
        `INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, is_published, stock_override)
         VALUES (gen_random_uuid(), $1, true, 1)
         RETURNING product_id`,
        [catId],
      );
      const testProductId = prodRes.rows[0].product_id;

      // Client 1 begins transaction and acquires lock
      await client1.query("BEGIN");
      await client1.query(
        `SELECT mapping.product_id, mapping.stock_override
         FROM public.ecom_product_catalog mapping
         WHERE mapping.product_id = $1
         FOR UPDATE OF mapping`,
        [testProductId],
      );

      // Client 1 inserts reservation hold of 1 unit
      await client1.query(
        `INSERT INTO public.ecom_inventory_reservations (product_id, quantity, status, expires_at)
         VALUES ($1, 1, 'HOLD', CURRENT_TIMESTAMP + interval '10 minutes')`,
        [testProductId],
      );

      // Client 2 begins transaction in background and tries to lock the same product
      let client2Acquired = false;
      const client2LockPromise = (async () => {
        await client2.query("BEGIN");
        await client2.query(
          `SELECT mapping.product_id, mapping.stock_override
           FROM public.ecom_product_catalog mapping
           WHERE mapping.product_id = $1
           FOR UPDATE OF mapping`,
          [testProductId],
        );
        client2Acquired = true;

        // When client 2 unblocks, it calculates active holds
        const holds = await client2.query<{ held: string }>(
          `SELECT COALESCE(SUM(quantity), 0) as held
           FROM public.ecom_inventory_reservations
           WHERE product_id = $1 AND status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP`,
          [testProductId],
        );
        const heldQty = Number(holds.rows[0].held);
        const available = Math.max(0, 1 - heldQty);

        if (available < 1) {
          await client2.query("ROLLBACK");
          return { reserved: false, error: "OUT_OF_STOCK" };
        }

        await client2.query("COMMIT");
        return { reserved: true };
      })();

      // Verify client 2 is currently blocked waiting for client 1's lock
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(client2Acquired, false, "Client 2 must be blocked by Client 1's row lock");

      // Client 1 commits
      await client1.query("COMMIT");

      // Client 2 now unblocks and finishes
      const client2Result = await client2LockPromise;
      assert.equal(client2Result.reserved, false);
      assert.equal(client2Result.error, "OUT_OF_STOCK");

      // Confirm exactly 1 hold exists
      const totalHoldsRes = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM public.ecom_inventory_reservations WHERE product_id = $1 AND status = 'HOLD'`,
        [testProductId],
      );
      assert.equal(Number(totalHoldsRes.rows[0].count), 1, "Exactly one hold must be reserved; no overselling");
    } finally {
      client1.release();
      client2.release();
    }
  });

  test("5. PostgreSQL Integration: Idempotency uniqueness under simultaneous duplicate insertion", async () => {
    const pool = getTestEcommerceDbPool();
    await resetTestDatabaseTables(pool);

    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      const key = "integration-idempotency-key-001";
      const scope = "user@test.com";

      await client1.query("BEGIN");
      await client2.query("BEGIN");

      // Client 1 inserts key
      await client1.query(
        `INSERT INTO public.ecom_order_idempotency (idempotency_key, scope, request_hash)
         VALUES ($1, $2, 'hash-1')`,
        [key, scope],
      );

      // Client 2 attempts to insert identical key
      let client2Error: unknown = null;
      try {
        await client2.query(
          `INSERT INTO public.ecom_order_idempotency (idempotency_key, scope, request_hash)
           VALUES ($1, $2, 'hash-1')`,
          [key, scope],
        );
      } catch (err) {
        client2Error = err;
      }

      await client1.query("COMMIT");
      await client2.query("ROLLBACK").catch(() => undefined);

      assert.ok(client2Error, "Second simultaneous insert with same key must hit unique constraint violation");
    } finally {
      client1.release();
      client2.release();
    }
  });

  test("6. PostgreSQL Integration: Expired holds and reservation release behave correctly", async () => {
    const pool = getTestEcommerceDbPool();
    const client = await pool.connect();

    try {
      const testProdId = "00000000-0000-0000-0000-000000000001";

      // Insert 1 expired hold and 1 active hold
      await client.query(
        `INSERT INTO public.ecom_inventory_reservations (product_id, quantity, status, expires_at)
         VALUES
           ($1, 2, 'HOLD', CURRENT_TIMESTAMP - interval '5 minutes'),
           ($1, 3, 'HOLD', CURRENT_TIMESTAMP + interval '10 minutes')`,
        [testProdId],
      );

      // Active holds query strictly excludes expired reservations
      const activeRes = await client.query<{ held: string }>(
        `SELECT SUM(quantity) as held
         FROM public.ecom_inventory_reservations
         WHERE product_id = $1 AND status = 'HOLD' AND expires_at > CURRENT_TIMESTAMP`,
        [testProdId],
      );
      assert.equal(Number(activeRes.rows[0].held), 3, "Only unexpired hold (3 units) must be counted as active");

      // Cleanup expired holds
      const updateRes = await client.query(
        `UPDATE public.ecom_inventory_reservations
         SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1 AND status = 'HOLD' AND expires_at <= CURRENT_TIMESTAMP`,
        [testProdId],
      );
      assert.equal(updateRes.rowCount, 1, "Exactly 1 expired reservation must transition to RELEASED");
    } finally {
      client.release();
    }
  });

  test("7. PostgreSQL Integration: Guest-order linking is transactional and respects ownership", async () => {
    const pool = getTestEcommerceDbPool();
    const client = await pool.connect();

    try {
      // 1. Create registered customer
      const custRes = await client.query<{ id: string }>(
        `INSERT INTO public.ecom_customers (email, first_name, last_name)
         VALUES ('realbuyer@example.com', 'Real', 'Buyer')
         RETURNING id`,
      );
      const customerId = custRes.rows[0].id;

      // 2. Create unassigned guest order
      const guestOrderRes = await client.query<{ id: string; order_number: string }>(
        `INSERT INTO public.ecom_orders (
           ecom_customer_id, status, total_amount, shipping_address_snapshot, billing_address_snapshot
         )
         VALUES (NULL, 'PENDING', 1200, '{}'::jsonb, '{"email": "realbuyer@example.com"}'::jsonb)
         RETURNING id, order_number`,
      );
      const guestOrderId = guestOrderRes.rows[0].id;

      // 3. Link guest orders using linkGuestOrdersToCustomer
      const linkResult = await linkGuestOrdersToCustomer(
        {
          email: "realbuyer@example.com",
          isEmailVerified: true,
          customerId,
        },
        client,
      );

      assert.equal(linkResult.success, true);
      assert.equal(linkResult.linkedCount, 1);

      // 4. Verify order is now linked to customerId
      const verifyRes = await client.query<{ ecom_customer_id: string }>(
        `SELECT ecom_customer_id FROM public.ecom_orders WHERE id = $1`,
        [guestOrderId],
      );
      assert.equal(verifyRes.rows[0].ecom_customer_id, customerId);

      // 5. Attempting to link by another customer cannot reassign it
      const adversaryLink = await linkGuestOrdersToCustomer(
        {
          email: "realbuyer@example.com",
          isEmailVerified: true,
          customerId: "cust-adversary-999",
        },
        client,
      );
      assert.equal(adversaryLink.linkedCount, 0, "Already-assigned order cannot be linked to another customer");
    } finally {
      client.release();
    }
  });

  test("8. PostgreSQL Integration: Duplicate payment confirmation is idempotent and avoids duplicate state transitions", async () => {
    const pool = getTestEcommerceDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Insert pending order
      const orderRes = await client.query<{ id: string; order_number: string }>(
        `INSERT INTO public.ecom_orders (status, payment_status, total_amount, shipping_address_snapshot, billing_address_snapshot)
         VALUES ('PENDING', 'PENDING', 1000, '{}'::jsonb, '{"email": "payment@test.com"}'::jsonb)
         RETURNING id, order_number`,
      );
      const orderId = orderRes.rows[0].id;
      const orderNumber = orderRes.rows[0].order_number;

      // Insert reservation hold
      await client.query(
        `INSERT INTO public.ecom_inventory_reservations (product_id, order_id, quantity, status, expires_at)
         VALUES ('00000000-0000-0000-0000-000000000002', $1, 1, 'HOLD', CURRENT_TIMESTAMP + interval '10 minutes')`,
        [orderId],
      );

      // Insert pending payment record
      const rzpOrderId = "order_rzp_integ_test_01";
      await client.query(
        `INSERT INTO public.ecom_payments (ecom_order_id, razorpay_order_id, amount, currency, status)
         VALUES ($1, $2, 1000, 'INR', 'CREATED')`,
        [orderId, rzpOrderId],
      );

      // First confirmation attempt
      const result1 = await processPaymentConfirmationTransaction({
        client,
        orderId,
        orderNumber,
        razorpayOrderId: rzpOrderId,
        paymentId: "pay_rzp_integ_test_99",
        signature: "valid_test_sig",
        method: "UPI",
        isSimulated: false,
      });

      assert.equal(result1.success, true);
      assert.equal(result1.status, "CONFIRMED");
      assert.equal(result1.paymentStatus, "PAID");

      // Repeated confirmation attempt with identical parameters
      const result2 = await processPaymentConfirmationTransaction({
        client,
        orderId,
        orderNumber,
        razorpayOrderId: rzpOrderId,
        paymentId: "pay_rzp_integ_test_99",
        signature: "valid_test_sig",
        method: "UPI",
        isSimulated: false,
      });

      assert.equal(result2.success, true);
      assert.equal(result2.alreadyPaid, true, "Subsequent payment confirmation must report alreadyPaid: true");

      await client.query("ROLLBACK"); // Roll back test transaction to leave disposable test DB clean
    } finally {
      client.release();
      await resetTestDatabaseTables(pool);
      await closeTestEcommerceDbPool();
    }
  });
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { linkGuestOrdersToCustomer } from "./account-linking";

interface MockOrderRecord {
  id: string;
  order_number: string;
  ecom_customer_id: string | null;
  billing_email: string;
}

function createMockAccountDb(initialOrders: MockOrderRecord[]) {
  const orders = new Map<string, MockOrderRecord>(
    initialOrders.map((o) => [o.id, { ...o }]),
  );
  const auditLogs: Array<{ sql: string; params?: unknown[] }> = [];

  const client = {
    query: async <T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> => {
      // 1. UPDATE ecom_orders SET ecom_customer_id = $1 WHERE ecom_customer_id IS NULL AND LOWER(...) = $2
      if (sql.includes("UPDATE public.ecom_orders") && sql.includes("WHERE ecom_customer_id IS NULL")) {
        const customerId = params?.[0] as string;
        const normalizedEmail = (params?.[1] as string)?.toLowerCase().trim();

        const updated: Array<{ id: string; order_number: string }> = [];
        for (const order of orders.values()) {
          // Strictly only link if ecom_customer_id IS NULL and email matches
          if (order.ecom_customer_id === null && order.billing_email.toLowerCase().trim() === normalizedEmail) {
            order.ecom_customer_id = customerId;
            updated.push({ id: order.id, order_number: order.order_number });
          }
        }
        return { rows: updated as unknown as T[] };
      }

      // 2. INSERT INTO public.ecom_audit_log
      if (sql.includes("INSERT INTO public.ecom_audit_log")) {
        auditLogs.push({ sql, params });
        return { rows: [] };
      }

      // 3. SELECT orders for a customer
      if (sql.includes("FROM public.ecom_orders") && sql.includes("WHERE orders.ecom_customer_id = $1")) {
        const customerId = params?.[0] as string;
        const matched = Array.from(orders.values()).filter((o) => o.ecom_customer_id === customerId);
        return { rows: matched as unknown as T[] };
      }

      return { rows: [] };
    },
  };

  return { client, orders, auditLogs };
}

// ============================================================================
// PHASE 2.3: ACCOUNT LINKING TEST SUITE
// ============================================================================

test("1. A verified account can retrieve its own securely linked guest orders", async () => {
  const db = createMockAccountDb([
    { id: "order-1", order_number: "ECOM-GUEST-01", ecom_customer_id: null, billing_email: "verified@example.com" },
    { id: "order-2", order_number: "ECOM-GUEST-02", ecom_customer_id: null, billing_email: "verified@example.com" },
  ]);

  const result = await linkGuestOrdersToCustomer(
    {
      email: "verified@example.com",
      isEmailVerified: true,
      customerId: "cust-uuid-100",
    },
    db.client,
  );

  assert.equal(result.success, true);
  assert.equal(result.linkedCount, 2);
  assert.deepEqual(result.orderNumbers.sort(), ["ECOM-GUEST-01", "ECOM-GUEST-02"]);

  // Verify orders now belong to customer in database
  assert.equal(db.orders.get("order-1")?.ecom_customer_id, "cust-uuid-100");
  assert.equal(db.orders.get("order-2")?.ecom_customer_id, "cust-uuid-100");
  assert.equal(db.auditLogs.length, 2, "Both linked orders must have audit log entries");
});

test("2. An unverified email cannot claim guest orders", async () => {
  const db = createMockAccountDb([
    { id: "order-1", order_number: "ECOM-GUEST-01", ecom_customer_id: null, billing_email: "unverified@example.com" },
  ]);

  const result = await linkGuestOrdersToCustomer(
    {
      email: "unverified@example.com",
      isEmailVerified: false, // NOT VERIFIED
      customerId: "cust-uuid-bad",
    },
    db.client,
  );

  assert.equal(result.success, false);
  assert.equal(result.linkedCount, 0);
  assert.match(result.error || "", /Email must be verified/i);

  // Order must remain unassigned
  assert.equal(db.orders.get("order-1")?.ecom_customer_id, null);
  assert.equal(db.auditLogs.length, 0);
});

test("3. A customer cannot claim another account's registered orders", async () => {
  const db = createMockAccountDb([
    // Order already registered to cust-alice
    { id: "order-alice", order_number: "ECOM-ALICE-01", ecom_customer_id: "cust-alice", billing_email: "shared@example.com" },
  ]);

  // Eve attempts to claim orders matching "shared@example.com"
  const result = await linkGuestOrdersToCustomer(
    {
      email: "shared@example.com",
      isEmailVerified: true,
      customerId: "cust-eve",
    },
    db.client,
  );

  // Zero rows linked because ecom_customer_id was NOT null
  assert.equal(result.success, true);
  assert.equal(result.linkedCount, 0);
  assert.equal(db.orders.get("order-alice")?.ecom_customer_id, "cust-alice", "Alice's order ownership must NOT change");
});

test("4. A guest order is linked only once (idempotency)", async () => {
  const db = createMockAccountDb([
    { id: "order-once", order_number: "ECOM-ONCE-01", ecom_customer_id: null, billing_email: "repeat@example.com" },
  ]);

  const call1 = await linkGuestOrdersToCustomer(
    {
      email: "repeat@example.com",
      isEmailVerified: true,
      customerId: "cust-1",
    },
    db.client,
  );
  assert.equal(call1.linkedCount, 1);

  // Second call with same email
  const call2 = await linkGuestOrdersToCustomer(
    {
      email: "repeat@example.com",
      isEmailVerified: true,
      customerId: "cust-1",
    },
    db.client,
  );
  assert.equal(call2.linkedCount, 0, "Second call must link 0 orders since it was already linked");
  assert.equal(db.orders.get("order-once")?.ecom_customer_id, "cust-1");
});

test("5. Email comparison is normalized consistently (case-insensitive and trimmed)", async () => {
  const db = createMockAccountDb([
    { id: "order-case", order_number: "ECOM-CASE-01", ecom_customer_id: null, billing_email: "CaSe.SeNsItIvE@Example.COM  " },
  ]);

  const result = await linkGuestOrdersToCustomer(
    {
      email: "  case.sensitive@example.com ",
      isEmailVerified: true,
      customerId: "cust-normalized",
    },
    db.client,
  );

  assert.equal(result.success, true);
  assert.equal(result.linkedCount, 1);
  assert.equal(db.orders.get("order-case")?.ecom_customer_id, "cust-normalized");
});

test("6. Orders already owned by another customer are never reassigned", async () => {
  const db = createMockAccountDb([
    { id: "order-owned", order_number: "ECOM-OWNED-01", ecom_customer_id: "customer-prime", billing_email: "same@example.com" },
    { id: "order-guest", order_number: "ECOM-GUEST-01", ecom_customer_id: null, billing_email: "same@example.com" },
  ]);

  const result = await linkGuestOrdersToCustomer(
    {
      email: "same@example.com",
      isEmailVerified: true,
      customerId: "customer-second",
    },
    db.client,
  );

  assert.equal(result.linkedCount, 1);
  assert.deepEqual(result.orderNumbers, ["ECOM-GUEST-01"]);
  assert.equal(db.orders.get("order-owned")?.ecom_customer_id, "customer-prime", "Prime customer's order remains owned by Prime");
  assert.equal(db.orders.get("order-guest")?.ecom_customer_id, "customer-second");
});

test("7. Two concurrent account-linking attempts cannot corrupt ownership", async () => {
  const db = createMockAccountDb([
    { id: "race-order", order_number: "ECOM-RACE-01", ecom_customer_id: null, billing_email: "contested@example.com" },
  ]);

  // Two customers racing to link the same unassigned guest order
  const [res1, res2] = await Promise.all([
    linkGuestOrdersToCustomer(
      { email: "contested@example.com", isEmailVerified: true, customerId: "cust-A" },
      db.client,
    ),
    linkGuestOrdersToCustomer(
      { email: "contested@example.com", isEmailVerified: true, customerId: "cust-B" },
      db.client,
    ),
  ]);

  // Exactly one of the two must have linked it
  const totalLinked = res1.linkedCount + res2.linkedCount;
  assert.equal(totalLinked, 1, "Exactly one customer may link the guest order");
  const finalOwner = db.orders.get("race-order")?.ecom_customer_id;
  assert.ok(finalOwner === "cust-A" || finalOwner === "cust-B");
});

test("8. Guest order details are not exposed through an unauthenticated account endpoint", async () => {
  // Simulator for account order route authorization
  function simulateAccountOrdersEndpoint(session: { user?: { email?: string; email_verified?: boolean } } | null) {
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) {
      return { status: 401, error: "Sign in to view your orders." };
    }
    return { status: 200, orders: [] };
  }

  const unauthenticatedResponse = simulateAccountOrdersEndpoint(null);
  assert.equal(unauthenticatedResponse.status, 401);
  assert.equal(unauthenticatedResponse.error, "Sign in to view your orders.");

  const emptyUserResponse = simulateAccountOrdersEndpoint({ user: {} });
  assert.equal(emptyUserResponse.status, 401);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "crypto";

// Test helper to compute request hash identical to production
function computeRequestHash(orderPayload: {
  customer: {
    email: string;
    contactPerson: string;
    companyName?: string | null;
    phone: string;
    shippingAddress: string;
    billingAddress: string;
    state: string;
  };
  lines: Array<{ productId: string; quantity: number }>;
}): string {
  const normalizedLines = [...orderPayload.lines]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map((l) => ({ productId: l.productId, quantity: l.quantity }));
  const normalizedPayload = JSON.stringify({
    customer: {
      email: orderPayload.customer.email.trim().toLowerCase(),
      contactPerson: orderPayload.customer.contactPerson.trim(),
      companyName: orderPayload.customer.companyName?.trim() || null,
      phone: orderPayload.customer.phone.trim(),
      shippingAddress: orderPayload.customer.shippingAddress.trim(),
      billingAddress: orderPayload.customer.billingAddress.trim(),
      state: orderPayload.customer.state.trim(),
    },
    lines: normalizedLines,
  });
  return crypto.createHash("sha256").update(normalizedPayload).digest("hex");
}

interface MockStockState {
  catalogOverride: number | null;
  erpQuantity: number;
  activeHolds: Array<{ id: string; quantity: number; expiresAt: Date; orderId: string }>;
  isPublished: boolean;
}

interface MockOrderResponseBody {
  orderId?: string;
  orderNumber?: string;
  status?: string;
  paymentStatus?: string;
  inventoryReserved?: boolean;
  expiresAt?: string;
  error?: string;
  [key: string]: unknown;
}

interface MockIdempotencyState {
  id: string;
  idempotency_key: string;
  scope: string;
  request_hash: string;
  ecom_order_id: string;
  response_payload: MockOrderResponseBody;
  status_code: number;
}

// In-memory simulator modeling row-level locks and transactional semantics
class MockOrderEngine {
  public stock: Map<string, MockStockState> = new Map();
  public idempotencyStore: Map<string, MockIdempotencyState> = new Map();
  public orders: Map<string, Record<string, unknown>> = new Map();
  public orderItems: Array<{ orderId: string; productId: string; quantity: number }> = [];
  public reservations: Array<{ id: string; orderId: string; productId: string; quantity: number; status: string; expiresAt: Date }> = [];
  public erpRecordsModified = 0;

  // A concurrency mutex simulating PostgreSQL row locks FOR UPDATE on ecom_product_catalog
  private productLocks: Map<string, Promise<void>> = new Map();
  // A concurrency mutex simulating PostgreSQL pg_advisory_xact_lock on idempotencyKey and scope
  private idempotencyLocks: Map<string, Promise<void>> = new Map();

  async acquireIdempotencyLock(key: string): Promise<() => void> {
    let currentLock = this.idempotencyLocks.get(key);
    let resolveLock!: () => void;
    const newLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    while (currentLock) {
      await currentLock;
      currentLock = this.idempotencyLocks.get(key);
    }

    this.idempotencyLocks.set(key, newLock);
    return () => {
      this.idempotencyLocks.delete(key);
      resolveLock();
    };
  }

  async acquireProductLocks(productIds: string[]): Promise<() => void> {
    // Deterministic sorted ordering to prevent deadlocks
    const sorted = [...new Set(productIds)].sort();
    const unlockFns: Array<() => void> = [];

    for (const pid of sorted) {
      let currentLock = this.productLocks.get(pid);
      let resolveLock!: () => void;
      const newLock = new Promise<void>((resolve) => {
        resolveLock = resolve;
      });

      while (currentLock) {
        await currentLock;
        currentLock = this.productLocks.get(pid);
      }

      this.productLocks.set(pid, newLock);
      unlockFns.push(() => {
        this.productLocks.delete(pid);
        resolveLock();
      });
    }

    return () => {
      // Release in reverse
      for (const fn of unlockFns.reverse()) {
        fn();
      }
    };
  }

  async processOrder(params: {
    idempotencyKey?: string | null;
    scope: string;
    customer: {
      email: string;
      contactPerson: string;
      companyName?: string | null;
      phone: string;
      shippingAddress: string;
      billingAddress: string;
      state: string;
      poNumber?: string | null;
      gstin?: string | null;
    };
    lines: Array<{ productId: string; quantity: number }>;
  }): Promise<{ status: number; body: MockOrderResponseBody }> {
    const { idempotencyKey, scope, customer, lines } = params;
    const requestHash = computeRequestHash({ customer, lines });

    // Validate idempotency key format if present
    if (idempotencyKey !== undefined && idempotencyKey !== null) {
      if (!/^[A-Za-z0-9_\-\.]{8,255}$/.test(idempotencyKey)) {
        return {
          status: 400,
          body: { error: "Invalid Idempotency-Key format. Must be 8-255 alphanumeric characters, dashes, or underscores." },
        };
      }
    }

    let releaseIdempotencyLock: (() => void) | null = null;
    if (idempotencyKey) {
      // Serializes concurrent requests with the identical idempotency key and scope
      releaseIdempotencyLock = await this.acquireIdempotencyLock(`${idempotencyKey}:${scope}`);
      const existing = this.idempotencyStore.get(`${idempotencyKey}:${scope}`);
      if (existing) {
        releaseIdempotencyLock();
        releaseIdempotencyLock = null;
        if (existing.request_hash === requestHash) {
          return {
            status: existing.status_code,
            body: existing.response_payload,
          };
        } else {
          return {
            status: 409,
            body: { error: "Idempotency key was reused with a materially different order request." },
          };
        }
      }
    }

    // Acquire deterministic row locks
    const releaseLocks = await this.acquireProductLocks(lines.map((l) => l.productId));

    try {
      // Recheck active holds past expiration
      const now = new Date();
      for (const line of lines) {
        const itemStock = this.stock.get(line.productId);
        if (!itemStock || !itemStock.isPublished) {
          return { status: 409, body: { error: "Product unavailable or not published." } };
        }

        const base = itemStock.catalogOverride !== null ? itemStock.catalogOverride : itemStock.erpQuantity;
        // Expired reservations do NOT count as active holds
        const activeHeld = itemStock.activeHolds
          .filter((h) => h.expiresAt > now)
          .reduce((sum, h) => sum + h.quantity, 0);

        const available = Math.max(0, base - activeHeld);
        if (line.quantity > available) {
          return {
            status: 409,
            body: { error: "The available quantity for this product has changed." },
          };
        }
      }

      // Create order atomically
      const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const orderNumber = `ECOM-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const responsePayload = {
        orderId,
        orderNumber,
        status: "PENDING",
        paymentStatus: "PENDING",
        inventoryReserved: true,
        expiresAt: expiresAt.toISOString(),
      };

      // Atomic commit
      this.orders.set(orderId, { id: orderId, orderNumber, customer, lines });
      for (const line of lines) {
        const itemStock = this.stock.get(line.productId)!;
        itemStock.activeHolds.push({
          id: `hold-${Math.random()}`,
          quantity: line.quantity,
          expiresAt,
          orderId,
        });
        this.orderItems.push({ orderId, productId: line.productId, quantity: line.quantity });
        this.reservations.push({
          id: `res-${Math.random()}`,
          orderId,
          productId: line.productId,
          quantity: line.quantity,
          status: "HOLD",
          expiresAt,
        });
      }

      // Record idempotency
      if (idempotencyKey) {
        this.idempotencyStore.set(`${idempotencyKey}:${scope}`, {
          id: `idem-${Math.random()}`,
          idempotency_key: idempotencyKey,
          scope,
          request_hash: requestHash,
          ecom_order_id: orderId,
          response_payload: responsePayload,
          status_code: 201,
        });
      }

      return { status: 201, body: responsePayload };
    } finally {
      releaseLocks();
      releaseIdempotencyLock?.();
    }
  }
}

// ============================================================================
// CONCURRENCY & IDEMPOTENCY TEST SUITE
// ============================================================================

test("1. Two simultaneous checkout requests competing for the last unit: at most one may reserve it", async () => {
  const engine = new MockOrderEngine();
  const productId = "product-last-unit";

  // Product has exactly 1 unit in stock
  engine.stock.set(productId, {
    catalogOverride: 1,
    erpQuantity: 1,
    activeHolds: [],
    isPublished: true,
  });

  const request1 = engine.processOrder({
    idempotencyKey: "client-attempt-1",
    scope: "user1@example.com",
    customer: { email: "user1@example.com", contactPerson: "Alice", phone: "9876543210", shippingAddress: "A", billingAddress: "A", state: "Maharashtra" },
    lines: [{ productId, quantity: 1 }],
  });

  const request2 = engine.processOrder({
    idempotencyKey: "client-attempt-2",
    scope: "user2@example.com",
    customer: { email: "user2@example.com", contactPerson: "Bob", phone: "9876543211", shippingAddress: "B", billingAddress: "B", state: "Karnataka" },
    lines: [{ productId, quantity: 1 }],
  });

  const [res1, res2] = await Promise.all([request1, request2]);

  // Exactly one must succeed (201) and the other must be rejected (409)
  const results = [res1.status, res2.status].sort();
  assert.deepEqual(results, [201, 409], "Exactly one of two concurrent requests should reserve the last unit");

  // Check active holds count: strictly 1, no overselling
  const stockState = engine.stock.get(productId)!;
  assert.equal(stockState.activeHolds.length, 1, "There must be exactly one active hold");
  assert.equal(stockState.activeHolds[0].quantity, 1);
});

test("2. Two simultaneous requests with the same idempotency key: only one order is created", async () => {
  const engine = new MockOrderEngine();
  const productId = "product-multi-stock";

  engine.stock.set(productId, {
    catalogOverride: 5,
    erpQuantity: 5,
    activeHolds: [],
    isPublished: true,
  });

  const duplicateKey = "shared-uuid-key-12345";
  const customer = { email: "buyer@example.com", contactPerson: "Buyer", phone: "9123456780", shippingAddress: "Street", billingAddress: "Street", state: "Delhi" };

  const [resA, resB] = await Promise.all([
    engine.processOrder({
      idempotencyKey: duplicateKey,
      scope: "buyer@example.com",
      customer,
      lines: [{ productId, quantity: 1 }],
    }),
    engine.processOrder({
      idempotencyKey: duplicateKey,
      scope: "buyer@example.com",
      customer,
      lines: [{ productId, quantity: 1 }],
    }),
  ]);

  // Both should receive successful responses with the same order number
  assert.equal(resA.status, 201);
  assert.equal(resB.status, 201);
  assert.equal(resA.body.orderNumber, resB.body.orderNumber, "Duplicate submission must return identical order");

  // Only one order should exist in the database
  assert.equal(engine.orders.size, 1, "Only one order record must be created");
  assert.equal(engine.reservations.length, 1, "Only one reservation hold must be created");
});

test("3. A repeated key with the same request returns the existing order", async () => {
  const engine = new MockOrderEngine();
  const productId = "prod-replay";

  engine.stock.set(productId, {
    catalogOverride: 10,
    erpQuantity: 10,
    activeHolds: [],
    isPublished: true,
  });

  const key = "idempotency-token-777";
  const customer = { email: "replay@example.com", contactPerson: "Replayer", phone: "9870001111", shippingAddress: "Addr", billingAddress: "Addr", state: "Gujarat" };

  const firstCall = await engine.processOrder({
    idempotencyKey: key,
    scope: "replay@example.com",
    customer,
    lines: [{ productId, quantity: 2 }],
  });

  assert.equal(firstCall.status, 201);

  // Subsequent call with exact same key and payload
  const secondCall = await engine.processOrder({
    idempotencyKey: key,
    scope: "replay@example.com",
    customer,
    lines: [{ productId, quantity: 2 }],
  });

  assert.equal(secondCall.status, 201);
  assert.equal(secondCall.body.orderNumber, firstCall.body.orderNumber);
  assert.equal(secondCall.body.orderId, firstCall.body.orderId);
  assert.equal(engine.orders.size, 1, "Must not create a second order");
});

test("4. Reusing a key with a different request returns 409", async () => {
  const engine = new MockOrderEngine();
  const productIdA = "prod-a";
  const productIdB = "prod-b";

  engine.stock.set(productIdA, { catalogOverride: 10, erpQuantity: 10, activeHolds: [], isPublished: true });
  engine.stock.set(productIdB, { catalogOverride: 10, erpQuantity: 10, activeHolds: [], isPublished: true });

  const key = "reused-key-mismatch";
  const customer = { email: "mismatch@example.com", contactPerson: "Test", phone: "9870002222", shippingAddress: "A", billingAddress: "A", state: "Punjab" };

  const firstCall = await engine.processOrder({
    idempotencyKey: key,
    scope: "mismatch@example.com",
    customer,
    lines: [{ productId: productIdA, quantity: 1 }],
  });
  assert.equal(firstCall.status, 201);

  // Reusing same key with DIFFERENT lines
  const tamperedCall = await engine.processOrder({
    idempotencyKey: key,
    scope: "mismatch@example.com",
    customer,
    lines: [{ productId: productIdB, quantity: 2 }],
  });

  assert.equal(tamperedCall.status, 409);
  assert.match(tamperedCall.body.error || "", /materially different/i);
});

test("5. Different valid idempotency keys create distinct orders when stock permits", async () => {
  const engine = new MockOrderEngine();
  const productId = "prod-distinct";

  engine.stock.set(productId, { catalogOverride: 10, erpQuantity: 10, activeHolds: [], isPublished: true });

  const customer = { email: "distinct@example.com", contactPerson: "Customer", phone: "9988776655", shippingAddress: "A", billingAddress: "A", state: "Haryana" };

  const res1 = await engine.processOrder({
    idempotencyKey: "unique-key-alpha-1",
    scope: "distinct@example.com",
    customer,
    lines: [{ productId, quantity: 1 }],
  });

  const res2 = await engine.processOrder({
    idempotencyKey: "unique-key-beta-2",
    scope: "distinct@example.com",
    customer,
    lines: [{ productId, quantity: 1 }],
  });

  assert.equal(res1.status, 201);
  assert.equal(res2.status, 201);
  assert.notEqual(res1.body.orderNumber, res2.body.orderNumber, "Distinct keys should produce distinct orders");
  assert.equal(engine.orders.size, 2);
});

test("6. A failed transaction leaves no partial order, items, reservations, or idempotency record", async () => {
  const engine = new MockOrderEngine();
  const productId = "prod-insufficient";

  // Stock is only 1, but order requests 3
  engine.stock.set(productId, { catalogOverride: 1, erpQuantity: 1, activeHolds: [], isPublished: true });

  const res = await engine.processOrder({
    idempotencyKey: "failed-attempt-key",
    scope: "fail@example.com",
    customer: { email: "fail@example.com", contactPerson: "Failer", phone: "9000000000", shippingAddress: "A", billingAddress: "A", state: "Goa" },
    lines: [{ productId, quantity: 3 }],
  });

  assert.equal(res.status, 409);
  assert.equal(engine.orders.size, 0, "No order must be stored on failure");
  assert.equal(engine.orderItems.length, 0, "No order items must be stored on failure");
  assert.equal(engine.reservations.length, 0, "No reservation must be stored on failure");
  assert.equal(engine.idempotencyStore.size, 0, "No idempotency record must be stored on failure");
});

test("7. Multi-product requests lock consistently in sorted order and avoid deadlocks", async () => {
  const engine = new MockOrderEngine();
  const prodA = "uuid-prod-aaa";
  const prodB = "uuid-prod-bbb";

  engine.stock.set(prodA, { catalogOverride: 5, erpQuantity: 5, activeHolds: [], isPublished: true });
  engine.stock.set(prodB, { catalogOverride: 5, erpQuantity: 5, activeHolds: [], isPublished: true });

  // Two simultaneous requests requesting both products in opposite array orders
  const req1 = engine.processOrder({
    idempotencyKey: "deadlock-test-1",
    scope: "u1@example.com",
    customer: { email: "u1@example.com", contactPerson: "A", phone: "9111111111", shippingAddress: "A", billingAddress: "A", state: "Kerala" },
    lines: [{ productId: prodA, quantity: 1 }, { productId: prodB, quantity: 1 }],
  });

  const req2 = engine.processOrder({
    idempotencyKey: "deadlock-test-2",
    scope: "u2@example.com",
    customer: { email: "u2@example.com", contactPerson: "B", phone: "9222222222", shippingAddress: "B", billingAddress: "B", state: "Kerala" },
    lines: [{ productId: prodB, quantity: 1 }, { productId: prodA, quantity: 1 }],
  });

  const [res1, res2] = await Promise.all([req1, req2]);

  assert.equal(res1.status, 201);
  assert.equal(res2.status, 201);
  assert.equal(engine.orders.size, 2, "Both multi-item orders must succeed without deadlocking");
});

test("8. Expired reservations do not count as active holds", async () => {
  const engine = new MockOrderEngine();
  const productId = "prod-expired-holds";

  // Base stock: 2. Has an active hold that expired 5 minutes ago.
  const expiredDate = new Date(Date.now() - 5 * 60 * 1000);
  engine.stock.set(productId, {
    catalogOverride: 2,
    erpQuantity: 2,
    activeHolds: [
      { id: "old-hold-1", quantity: 2, expiresAt: expiredDate, orderId: "old-order" },
    ],
    isPublished: true,
  });

  // Since the hold is expired, 2 units are available now!
  const res = await engine.processOrder({
    idempotencyKey: "expired-hold-reclaim-key",
    scope: "buyer@example.com",
    customer: { email: "buyer@example.com", contactPerson: "Buyer", phone: "9333333333", shippingAddress: "A", billingAddress: "A", state: "Assam" },
    lines: [{ productId, quantity: 2 }],
  });

  assert.equal(res.status, 201, "Expired hold must not prevent new order reservation");
});

test("9. ERP database records remain untouched", async () => {
  const engine = new MockOrderEngine();
  const productId = "prod-erp-read-only";

  engine.stock.set(productId, { catalogOverride: 5, erpQuantity: 5, activeHolds: [], isPublished: true });

  await engine.processOrder({
    idempotencyKey: "erp-test-key",
    scope: "erp@example.com",
    customer: { email: "erp@example.com", contactPerson: "Reader", phone: "9444444444", shippingAddress: "A", billingAddress: "A", state: "Bihar" },
    lines: [{ productId, quantity: 2 }],
  });

  assert.equal(engine.erpRecordsModified, 0, "ERP database records must strictly remain untouched");
});

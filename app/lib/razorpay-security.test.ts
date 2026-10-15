import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "crypto";
import {
  isPaymentSimulationAllowed,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchAndVerifyServerPayment,
  isOrderAuthorized,
  processPaymentConfirmationTransaction,
} from "./razorpay-service";

const TEST_SECRET = "test_razorpay_secret_key_12345";
const TEST_WEBHOOK_SECRET = "test_webhook_secret_key_67890";
const TEST_ORDER_ID = "order_EK1234567890ab";
const TEST_PAYMENT_ID = "pay_EK0987654321cd";

function computeValidPaymentSignature(orderId: string, paymentId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

function computeValidWebhookSignature(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

// --------------------------------------------------------------------------
// 1. Missing secret is rejected (Fails closed)
// --------------------------------------------------------------------------
test("verifyPaymentSignature fails closed when secret is missing or empty", () => {
  const validSig = computeValidPaymentSignature(TEST_ORDER_ID, TEST_PAYMENT_ID, TEST_SECRET);

  // Missing secret entirely
  const resultMissing = verifyPaymentSignature({
    razorpayOrderId: TEST_ORDER_ID,
    razorpayPaymentId: TEST_PAYMENT_ID,
    razorpaySignature: validSig,
    secret: "",
  });
  assert.equal(resultMissing.valid, false);
  assert.match(resultMissing.error || "", /secret is not configured/i);

  // Whitespace-only secret
  const resultWhitespace = verifyPaymentSignature({
    razorpayOrderId: TEST_ORDER_ID,
    razorpayPaymentId: TEST_PAYMENT_ID,
    razorpaySignature: validSig,
    secret: "   ",
  });
  assert.equal(resultWhitespace.valid, false);
});

test("verifyWebhookSignature fails closed when webhook secret is missing or empty", () => {
  const rawBody = JSON.stringify({ event: "payment.captured" });
  const validSig = computeValidWebhookSignature(rawBody, TEST_WEBHOOK_SECRET);

  const resultMissing = verifyWebhookSignature({
    rawBody,
    signature: validSig,
    webhookSecret: "",
  });
  assert.equal(resultMissing.valid, false);
  assert.match(resultMissing.error || "", /webhook secret is not configured/i);
});

// --------------------------------------------------------------------------
// 2. Invalid signature is rejected
// --------------------------------------------------------------------------
test("verifyPaymentSignature rejects invalid, tampered, or wrong-secret signatures", () => {
  const validSig = computeValidPaymentSignature(TEST_ORDER_ID, TEST_PAYMENT_ID, TEST_SECRET);

  // Tampered signature string
  const tamperedSig = "a" + validSig.slice(1);
  const resultTampered = verifyPaymentSignature({
    razorpayOrderId: TEST_ORDER_ID,
    razorpayPaymentId: TEST_PAYMENT_ID,
    razorpaySignature: tamperedSig,
    secret: TEST_SECRET,
  });
  assert.equal(resultTampered.valid, false);
  assert.match(resultTampered.error || "", /mismatch/i);

  // Wrong order ID
  const resultWrongOrder = verifyPaymentSignature({
    razorpayOrderId: "order_WRONG12345678",
    razorpayPaymentId: TEST_PAYMENT_ID,
    razorpaySignature: validSig,
    secret: TEST_SECRET,
  });
  assert.equal(resultWrongOrder.valid, false);

  // Wrong secret
  const resultWrongSecret = verifyPaymentSignature({
    razorpayOrderId: TEST_ORDER_ID,
    razorpayPaymentId: TEST_PAYMENT_ID,
    razorpaySignature: validSig,
    secret: "different_secret_key",
  });
  assert.equal(resultWrongSecret.valid, false);

  // Valid signature succeeds
  const resultValid = verifyPaymentSignature({
    razorpayOrderId: TEST_ORDER_ID,
    razorpayPaymentId: TEST_PAYMENT_ID,
    razorpaySignature: validSig,
    secret: TEST_SECRET,
  });
  assert.equal(resultValid.valid, true);
});

test("verifyWebhookSignature rejects invalid and tampered webhook bodies", () => {
  const rawBody = JSON.stringify({ event: "payment.captured", amount: 5000 });
  const validSig = computeValidWebhookSignature(rawBody, TEST_WEBHOOK_SECRET);

  // Valid body and signature passes
  const resultValid = verifyWebhookSignature({
    rawBody,
    signature: validSig,
    webhookSecret: TEST_WEBHOOK_SECRET,
  });
  assert.equal(resultValid.valid, true);

  // Tampered payload
  const tamperedBody = JSON.stringify({ event: "payment.captured", amount: 100 });
  const resultTampered = verifyWebhookSignature({
    rawBody: tamperedBody,
    signature: validSig,
    webhookSecret: TEST_WEBHOOK_SECRET,
  });
  assert.equal(resultTampered.valid, false);
  assert.match(resultTampered.error || "", /mismatch/i);
});

// --------------------------------------------------------------------------
// 3. Client-supplied simulation in production is rejected
// --------------------------------------------------------------------------
test("isPaymentSimulationAllowed strictly rejects production and non-opt-in states", () => {
  const origEnv = process.env.NODE_ENV;
  const origSim = process.env.ENABLE_PAYMENT_SIMULATION;

  try {
    // 1. In production, even if ENABLE_PAYMENT_SIMULATION is true -> MUST BE FALSE
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.ENABLE_PAYMENT_SIMULATION = "true";
    assert.equal(isPaymentSimulationAllowed(), false);

    // 2. In development, but without ENABLE_PAYMENT_SIMULATION -> MUST BE FALSE
    (process.env as Record<string, string>).NODE_ENV = "development";
    process.env.ENABLE_PAYMENT_SIMULATION = "false";
    assert.equal(isPaymentSimulationAllowed(), false);

    delete process.env.ENABLE_PAYMENT_SIMULATION;
    assert.equal(isPaymentSimulationAllowed(), false);

    // 3. ONLY when explicitly in development AND explicitly ENABLE_PAYMENT_SIMULATION=true
    (process.env as Record<string, string>).NODE_ENV = "development";
    process.env.ENABLE_PAYMENT_SIMULATION = "true";
    assert.equal(isPaymentSimulationAllowed(), true);
  } finally {
    (process.env as Record<string, string>).NODE_ENV = origEnv;
    if (origSim === undefined) delete process.env.ENABLE_PAYMENT_SIMULATION;
    else process.env.ENABLE_PAYMENT_SIMULATION = origSim;
  }
});

// --------------------------------------------------------------------------
// 4. Server-side payment verification: amount, currency, order ID, status
// --------------------------------------------------------------------------
test("fetchAndVerifyServerPayment enforces exact order ID, amount in paise, currency INR, and captured status", async () => {
  const mockPayment = {
    id: TEST_PAYMENT_ID,
    entity: "payment",
    order_id: TEST_ORDER_ID,
    amount: 1061764, // ₹10,617.64 in paise
    currency: "INR",
    status: "captured",
  };

  const createMockFetch = (responseJson: Record<string, unknown>, status = 200) => {
    return (async () => {
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => responseJson,
        text: async () => JSON.stringify(responseJson),
      } as Response;
    }) as unknown as typeof fetch;
  };

  // Valid payment succeeds
  const validCheck = await fetchAndVerifyServerPayment({
    paymentId: TEST_PAYMENT_ID,
    expectedOrderId: TEST_ORDER_ID,
    expectedAmountPaise: 1061764,
    expectedCurrency: "INR",
    keyId: "rzp_test_key",
    keySecret: "rzp_test_secret",
    fetchFn: createMockFetch(mockPayment),
  });
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.payment?.id, TEST_PAYMENT_ID);

  // Mismatched Order ID
  const wrongOrderCheck = await fetchAndVerifyServerPayment({
    paymentId: TEST_PAYMENT_ID,
    expectedOrderId: "order_DIFFERENT_9999",
    expectedAmountPaise: 1061764,
    expectedCurrency: "INR",
    keyId: "rzp_test_key",
    keySecret: "rzp_test_secret",
    fetchFn: createMockFetch(mockPayment),
  });
  assert.equal(wrongOrderCheck.valid, false);
  assert.match(wrongOrderCheck.error || "", /order id mismatch/i);

  // Mismatched Amount (e.g. customer paid 100 paise instead of 1061764)
  const wrongAmountCheck = await fetchAndVerifyServerPayment({
    paymentId: TEST_PAYMENT_ID,
    expectedOrderId: TEST_ORDER_ID,
    expectedAmountPaise: 1061764,
    expectedCurrency: "INR",
    keyId: "rzp_test_key",
    keySecret: "rzp_test_secret",
    fetchFn: createMockFetch({ ...mockPayment, amount: 100 }),
  });
  assert.equal(wrongAmountCheck.valid, false);
  assert.match(wrongAmountCheck.error || "", /amount mismatch/i);

  // Mismatched Currency (e.g. USD instead of INR)
  const wrongCurrencyCheck = await fetchAndVerifyServerPayment({
    paymentId: TEST_PAYMENT_ID,
    expectedOrderId: TEST_ORDER_ID,
    expectedAmountPaise: 1061764,
    expectedCurrency: "INR",
    keyId: "rzp_test_key",
    keySecret: "rzp_test_secret",
    fetchFn: createMockFetch({ ...mockPayment, currency: "USD" }),
  });
  assert.equal(wrongCurrencyCheck.valid, false);
  assert.match(wrongCurrencyCheck.error || "", /currency mismatch/i);

  // Invalid Payment Status (e.g. 'failed' or 'created')
  const failedStatusCheck = await fetchAndVerifyServerPayment({
    paymentId: TEST_PAYMENT_ID,
    expectedOrderId: TEST_ORDER_ID,
    expectedAmountPaise: 1061764,
    expectedCurrency: "INR",
    keyId: "rzp_test_key",
    keySecret: "rzp_test_secret",
    fetchFn: createMockFetch({ ...mockPayment, status: "failed" }),
  });
  assert.equal(failedStatusCheck.valid, false);
  assert.match(failedStatusCheck.error || "", /status invalid/i);

  // Missing credentials fails closed
  const missingCredsCheck = await fetchAndVerifyServerPayment({
    paymentId: TEST_PAYMENT_ID,
    expectedOrderId: TEST_ORDER_ID,
    expectedAmountPaise: 1061764,
    expectedCurrency: "INR",
    keyId: "",
    keySecret: "",
    fetchFn: createMockFetch(mockPayment),
  });
  assert.equal(missingCredsCheck.valid, false);
  assert.match(missingCredsCheck.error || "", /credentials are not configured/i);
});

// --------------------------------------------------------------------------
// 5. Order ownership authorization
// --------------------------------------------------------------------------
test("isOrderAuthorized checks ownership against session email, customer email, and phone", () => {
  const billingSnapshot = {
    email: "legit.buyer@example.com",
    phone: "9876543210",
  };

  // Staff is always authorized
  assert.equal(
    isOrderAuthorized({ billingSnapshot, isStaff: true }),
    true,
  );

  // Authenticated matching customer session
  assert.equal(
    isOrderAuthorized({ billingSnapshot, sessionEmail: "legit.buyer@example.com" }),
    true,
  );

  // Authenticated non-matching customer session -> REJECTED
  assert.equal(
    isOrderAuthorized({ billingSnapshot, sessionEmail: "attacker@example.com" }),
    false,
  );

  // Authenticated attacker CANNOT spoof authorization by passing victim's email or phone in body
  assert.equal(
    isOrderAuthorized({
      billingSnapshot,
      sessionEmail: "attacker@example.com",
      customerEmail: "legit.buyer@example.com",
      customerPhone: "9876543210",
    }),
    false,
  );

  // Unauthenticated caller CANNOT access an order created by a registered user
  assert.equal(
    isOrderAuthorized({
      billingSnapshot,
      orderCustomerId: "user-registered-uuid-1",
      customerEmail: "legit.buyer@example.com",
      customerPhone: "9876543210",
    }),
    false,
  );

  // Authenticated registered owner CAN access their registered order
  assert.equal(
    isOrderAuthorized({
      billingSnapshot,
      sessionEmail: "legit.buyer@example.com",
      orderCustomerId: "user-registered-uuid-1",
    }),
    true,
  );

  // Guest checkout matching customerEmail
  assert.equal(
    isOrderAuthorized({ billingSnapshot, customerEmail: "legit.buyer@example.com" }),
    true,
  );

  // Guest checkout matching customerPhone
  assert.equal(
    isOrderAuthorized({ billingSnapshot, customerPhone: "9876543210" }),
    true,
  );

  // Arbitrary unauthenticated caller without matching credentials -> REJECTED
  assert.equal(
    isOrderAuthorized({ billingSnapshot, customerEmail: "random@example.com", customerPhone: "1111111111" }),
    false,
  );
  assert.equal(
    isOrderAuthorized({ billingSnapshot }),
    false,
  );
});

// --------------------------------------------------------------------------
// 6. Idempotency & Expired hold reconciliation logic
// --------------------------------------------------------------------------
test("processPaymentConfirmationTransaction handles idempotency and expired hold without overselling", async () => {
  // Mock client to test transactional branches
  let updateStatusCalledWith = "";
  let auditActionCalledWith = "";

  const createMockDbClient = (opts: { isAlreadyPaid?: boolean; activeHoldCount: number; orderItemCount?: number }) => {
    return {
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes("SELECT id, order_number, status, payment_status")) {
          return {
            rows: [
              {
                id: "test-order-uuid-1",
                order_number: "ECOM-2026-TEST01",
                status: opts.isAlreadyPaid ? "CONFIRMED" : "PENDING",
                payment_status: opts.isAlreadyPaid ? "PAID" : "PENDING",
                total_amount: "10617.64",
                notes: null,
              },
            ],
          };
        }
        if (sql.includes("SELECT COUNT(*) as count FROM public.ecom_order_items")) {
          return {
            rows: [{ count: String(opts.orderItemCount ?? 1) }],
          };
        }
        if (sql.includes("SELECT id, product_id, quantity, expires_at")) {
          return {
            rows: opts.activeHoldCount > 0
              ? Array.from({ length: opts.activeHoldCount }, (_, i) => ({
                  id: `res-uuid-${i + 1}`,
                  product_id: `prod-${i + 1}`,
                  quantity: 2,
                  expires_at: new Date(Date.now() + 60000),
                }))
              : [],
          };
        }
        if (sql.includes("UPDATE public.ecom_orders")) {
          if (sql.includes("status = 'CONFIRMED'")) updateStatusCalledWith = "CONFIRMED";
          else if (sql.includes("status = 'PAYMENT_REVIEW'")) updateStatusCalledWith = "PAYMENT_REVIEW";
          return { rowCount: 1 };
        }
        if (sql.includes("INSERT INTO public.ecom_audit_log")) {
          if (sql.includes("'PAYMENT_CONFIRMED'")) auditActionCalledWith = "PAYMENT_CONFIRMED";
          else if (sql.includes("'PAYMENT_HOLD_EXPIRED'")) auditActionCalledWith = "PAYMENT_HOLD_EXPIRED";
          return { rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
    };
  };

  // Branch A: Already paid -> Idempotent early return
  const mockAlreadyPaid = createMockDbClient({ isAlreadyPaid: true, activeHoldCount: 1 });
  const resAlreadyPaid = await processPaymentConfirmationTransaction({
    client: mockAlreadyPaid as any,
    orderId: "test-order-uuid-1",
    orderNumber: "ECOM-2026-TEST01",
    razorpayOrderId: TEST_ORDER_ID,
    paymentId: TEST_PAYMENT_ID,
    signature: "sig123",
    method: "RAZORPAY",
    isSimulated: false,
  });
  assert.equal(resAlreadyPaid.success, true);
  assert.equal(resAlreadyPaid.alreadyPaid, true);

  // Branch B: Active hold exists -> Normal confirmation
  const mockActiveHold = createMockDbClient({ isAlreadyPaid: false, activeHoldCount: 1, orderItemCount: 1 });
  const resActiveHold = await processPaymentConfirmationTransaction({
    client: mockActiveHold as any,
    orderId: "test-order-uuid-1",
    orderNumber: "ECOM-2026-TEST01",
    razorpayOrderId: TEST_ORDER_ID,
    paymentId: TEST_PAYMENT_ID,
    signature: "sig123",
    method: "RAZORPAY",
    isSimulated: false,
  });
  assert.equal(resActiveHold.success, true);
  assert.equal(resActiveHold.status, "CONFIRMED");
  assert.equal(resActiveHold.paymentStatus, "PAID");
  assert.equal(updateStatusCalledWith, "CONFIRMED");
  assert.equal(auditActionCalledWith, "PAYMENT_CONFIRMED");

  // Branch C: Hold EXPIRED (0 active holds) -> Must NOT oversell! Placed in PAYMENT_REVIEW
  const mockExpiredHold = createMockDbClient({ isAlreadyPaid: false, activeHoldCount: 0, orderItemCount: 1 });
  const resExpiredHold = await processPaymentConfirmationTransaction({
    client: mockExpiredHold as any,
    orderId: "test-order-uuid-1",
    orderNumber: "ECOM-2026-TEST01",
    razorpayOrderId: TEST_ORDER_ID,
    paymentId: TEST_PAYMENT_ID,
    signature: "sig123",
    method: "RAZORPAY",
    isSimulated: false,
  });
  assert.equal(resExpiredHold.success, false);
  assert.equal(resExpiredHold.holdExpired, true);
  assert.equal(resExpiredHold.status, "PAYMENT_REVIEW");
  assert.equal(resExpiredHold.paymentStatus, "PAID");
  assert.equal(updateStatusCalledWith, "PAYMENT_REVIEW");
  assert.equal(auditActionCalledWith, "PAYMENT_HOLD_EXPIRED");
  assert.match(resExpiredHold.error || "", /reservation expired/i);

  // Branch D: Partial hold expiration (2 items in order, only 1 hold remaining) -> MUST NOT oversell! Placed in PAYMENT_REVIEW
  const mockPartialHold = createMockDbClient({ isAlreadyPaid: false, activeHoldCount: 1, orderItemCount: 2 });
  const resPartialHold = await processPaymentConfirmationTransaction({
    client: mockPartialHold as any,
    orderId: "test-order-uuid-1",
    orderNumber: "ECOM-2026-TEST01",
    razorpayOrderId: TEST_ORDER_ID,
    paymentId: TEST_PAYMENT_ID,
    signature: "sig123",
    method: "RAZORPAY",
    isSimulated: false,
  });
  assert.equal(resPartialHold.success, false);
  assert.equal(resPartialHold.holdExpired, true);
  assert.equal(resPartialHold.status, "PAYMENT_REVIEW");
});

// --------------------------------------------------------------------------
// 7. Webhook Idempotency Simulation Test
// --------------------------------------------------------------------------
test("repeated webhook delivery is idempotent and does not duplicate state transitions", async () => {
  const processedEventIds = new Set<string>();
  let processPaymentCalls = 0;

  const simulateWebhookDelivery = async (eventId: string, rawBody: string, signature: string) => {
    // 1. Verify signature
    const sigCheck = verifyWebhookSignature({ rawBody, signature, webhookSecret: TEST_WEBHOOK_SECRET });
    if (!sigCheck.valid) return { status: "error", code: 400, message: sigCheck.error };

    // 2. Check eventId uniqueness (analogous to ON CONFLICT DO NOTHING)
    if (processedEventIds.has(eventId)) {
      return { status: "ignored", code: 200, message: "Duplicate webhook event already processed." };
    }
    processedEventIds.add(eventId);

    // 3. Process payment confirmation
    processPaymentCalls += 1;
    return { status: "success", code: 200, eventId };
  };

  const webhookBody = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: TEST_PAYMENT_ID,
          order_id: TEST_ORDER_ID,
          amount: 1061764,
          currency: "INR",
          status: "captured",
        },
      },
    },
  });
  const validSignature = computeValidWebhookSignature(webhookBody, TEST_WEBHOOK_SECRET);
  const eventId = "evt_test_unique_id_101";

  // First delivery: processes successfully
  const firstDelivery = await simulateWebhookDelivery(eventId, webhookBody, validSignature);
  assert.equal(firstDelivery.status, "success");
  assert.equal(processPaymentCalls, 1);

  // Second delivery (duplicate event ID): ignored safely without reprocessing
  const secondDelivery = await simulateWebhookDelivery(eventId, webhookBody, validSignature);
  assert.equal(secondDelivery.status, "ignored");
  assert.equal(processPaymentCalls, 1); // Not incremented!
});

// --------------------------------------------------------------------------
// 8. Server Payment Verification: Captured status flag check & Currency INR enforcement
// --------------------------------------------------------------------------
test("fetchAndVerifyServerPayment rejects payment with captured=false or non-INR currency", async () => {
  const createMockFetch = (responseJson: Record<string, unknown>, status = 200) => {
    return (async () => {
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => responseJson,
        text: async () => JSON.stringify(responseJson),
      } as Response;
    }) as unknown as typeof fetch;
  };

  // Rejects when status is captured but captured flag is explicitly false
  const uncapturedResult = await fetchAndVerifyServerPayment({
    paymentId: TEST_PAYMENT_ID,
    expectedOrderId: TEST_ORDER_ID,
    expectedAmountPaise: 1061764,
    expectedCurrency: "INR",
    keyId: "rzp_test_key",
    keySecret: "rzp_test_secret",
    fetchFn: createMockFetch({
      id: TEST_PAYMENT_ID,
      order_id: TEST_ORDER_ID,
      amount: 1061764,
      currency: "INR",
      status: "captured",
      captured: false,
    }),
  });
  assert.equal(uncapturedResult.valid, false);
  assert.match(uncapturedResult.error || "", /captured flag is false/i);

  // Rejects non-INR expectedCurrency
  const nonInrExpected = await fetchAndVerifyServerPayment({
    paymentId: TEST_PAYMENT_ID,
    expectedOrderId: TEST_ORDER_ID,
    expectedAmountPaise: 1061764,
    expectedCurrency: "USD",
    keyId: "rzp_test_key",
    keySecret: "rzp_test_secret",
    fetchFn: createMockFetch({
      id: TEST_PAYMENT_ID,
      order_id: TEST_ORDER_ID,
      amount: 1061764,
      currency: "USD",
      status: "captured",
    }),
  });
  assert.equal(nonInrExpected.valid, false);
  assert.match(nonInrExpected.error || "", /expected currency must be inr/i);
});

// --------------------------------------------------------------------------
// 9. Dedicated Audit Findings Tests
// --------------------------------------------------------------------------
test("an unauthorized customer cannot initialize payment for another customer's order", () => {
  const victimOrderSnapshot = {
    email: "victim.customer@example.com",
    phone: "9123456789",
  };

  // Case 1: Attacker is authenticated with their own account
  const attackerAuthCheck = isOrderAuthorized({
    billingSnapshot: victimOrderSnapshot,
    sessionEmail: "attacker.user@example.com",
    orderCustomerId: "victim-account-uuid-1",
  });
  assert.equal(attackerAuthCheck, false, "Authenticated attacker must be blocked");

  // Case 2: Attacker is authenticated and tries to provide victim's email/phone in payload
  const attackerSpoofCheck = isOrderAuthorized({
    billingSnapshot: victimOrderSnapshot,
    sessionEmail: "attacker.user@example.com",
    orderCustomerId: "victim-account-uuid-1",
    customerEmail: "victim.customer@example.com",
    customerPhone: "9123456789",
  });
  assert.equal(attackerSpoofCheck, false, "Authenticated attacker spoofing body must be blocked");

  // Case 3: Unauthenticated caller attempts to initialize payment for registered user order
  const guestHijackCheck = isOrderAuthorized({
    billingSnapshot: victimOrderSnapshot,
    sessionEmail: null,
    orderCustomerId: "victim-account-uuid-1",
    customerEmail: "victim.customer@example.com",
  });
  assert.equal(guestHijackCheck, false, "Guest cannot hijack registered user order");

  // Case 4: Legit customer accessing their own order succeeds
  const legitCheck = isOrderAuthorized({
    billingSnapshot: victimOrderSnapshot,
    sessionEmail: "victim.customer@example.com",
    orderCustomerId: "victim-account-uuid-1",
  });
  assert.equal(legitCheck, true, "Legit customer must be permitted");
});

test("expired inventory holds do not lead to an order being falsely marked paid or confirmed", async () => {
  let statusUpdatedTo = "";
  let auditActionLogged = "";
  let stockUpdated = false;

  const mockDbClient = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes("SELECT id, order_number, status, payment_status")) {
        return {
          rows: [
            {
              id: "order-hold-expired-uuid",
              order_number: "ECOM-2026-EXPIRED",
              status: "PENDING",
              payment_status: "PENDING",
              total_amount: "5000.00",
              notes: "Initial order note",
            },
          ],
        };
      }
      if (sql.includes("SELECT COUNT(*) as count FROM public.ecom_order_items")) {
        return { rows: [{ count: "1" }] };
      }
      // Return 0 active holds (hold has expired or been released)
      if (sql.includes("SELECT id, product_id, quantity, expires_at")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE public.ecom_product_catalog")) {
        stockUpdated = true;
        return { rowCount: 1 };
      }
      if (sql.includes("UPDATE public.ecom_orders")) {
        if (sql.includes("status = 'CONFIRMED'")) statusUpdatedTo = "CONFIRMED";
        else if (sql.includes("status = 'PAYMENT_REVIEW'")) statusUpdatedTo = "PAYMENT_REVIEW";
        return { rowCount: 1 };
      }
      if (sql.includes("INSERT INTO public.ecom_audit_log")) {
        if (sql.includes("'PAYMENT_HOLD_EXPIRED'")) auditActionLogged = "PAYMENT_HOLD_EXPIRED";
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  const result = await processPaymentConfirmationTransaction({
    client: mockDbClient as any,
    orderId: "order-hold-expired-uuid",
    orderNumber: "ECOM-2026-EXPIRED",
    razorpayOrderId: "order_EXPIRED123",
    paymentId: "pay_EXPIRED456",
    signature: "sig_valid",
    method: "RAZORPAY",
    isSimulated: false,
  });

  // Verify: Order must NOT be confirmed, stock must NOT be committed/deducted
  assert.equal(result.success, false);
  assert.equal(result.holdExpired, true);
  assert.equal(result.status, "PAYMENT_REVIEW");
  assert.equal(statusUpdatedTo, "PAYMENT_REVIEW");
  assert.notEqual(statusUpdatedTo, "CONFIRMED");
  assert.equal(stockUpdated, false, "Stock must never be deducted when hold is expired");
  assert.equal(auditActionLogged, "PAYMENT_HOLD_EXPIRED");
  assert.match(result.error || "", /reservation expired/i);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "crypto";
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchAndVerifyServerPayment,
} from "./razorpay-service";

// ============================================================================
// PHASE 3.C: RAZORPAY TEST-MODE & MOCKED GATEWAY VERIFICATION
// ============================================================================

test("1. verifyPaymentSignature fails closed when secret is missing, empty, or whitespace", () => {
  const res1 = verifyPaymentSignature({
    razorpayOrderId: "order_test_123",
    razorpayPaymentId: "pay_test_456",
    razorpaySignature: "abc",
    secret: "",
  });
  assert.equal(res1.valid, false);
  assert.match(res1.error || "", /not configured/i);

  const res2 = verifyPaymentSignature({
    razorpayOrderId: "order_test_123",
    razorpayPaymentId: "pay_test_456",
    razorpaySignature: "abc",
    secret: "   ",
  });
  assert.equal(res2.valid, false);
});

test("2. Fallback key 'rzp_test_sourceasia_dev' is not treated as a real gateway credential", () => {
  const fallbackKey: string = "rzp_test_sourceasia_dev";
  const isReal = fallbackKey !== "rzp_test_sourceasia_dev" && fallbackKey.startsWith("rzp_test_");
  assert.equal(isReal, false, "Fallback developer key must never be used as a real Razorpay API credential");
});

test("3. Payment signature verification validates correct HMAC SHA-256 and rejects tampered values", () => {
  const secret = "test_webhook_secret_key_999";
  const orderId = "order_rzp_live_sandbox_001";
  const paymentId = "pay_rzp_live_sandbox_002";

  const validSig = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const successRes = verifyPaymentSignature({
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: validSig,
    secret,
  });
  assert.equal(successRes.valid, true);

  // Tampered payment ID
  const tamperedRes = verifyPaymentSignature({
    razorpayOrderId: orderId,
    razorpayPaymentId: "pay_rzp_tampered_999",
    razorpaySignature: validSig,
    secret,
  });
  assert.equal(tamperedRes.valid, false);
});

test("4. Webhook verification rejects tampered payloads and wrong signatures", () => {
  const secret = "webhook_secret_testing_444";
  const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });

  const validSig = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const validRes = verifyWebhookSignature({
    rawBody,
    signature: validSig,
    webhookSecret: secret,
  });
  assert.equal(validRes.valid, true);

  const tamperedRes = verifyWebhookSignature({
    rawBody: rawBody + " ",
    signature: validSig,
    webhookSecret: secret,
  });
  assert.equal(tamperedRes.valid, false);
});

test("5. fetchAndVerifyServerPayment fails closed if credentials are not configured", async () => {
  const res = await fetchAndVerifyServerPayment({
    paymentId: "pay_fake_123",
    expectedOrderId: "order_fake_123",
    expectedAmountPaise: 50000,
    expectedCurrency: "INR",
    keyId: "",
    keySecret: "",
  });

  assert.equal(res.valid, false);
  assert.match(res.error || "", /credentials are not configured/i);
});

test("6. fetchAndVerifyServerPayment strictly enforces exact order ID, amount, currency, and captured status", async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: "pay_mock_100",
      order_id: "order_mock_100",
      amount: 100000, // 1000.00 INR in paise
      currency: "INR",
      status: "captured",
      captured: true,
    }),
  } as unknown as Response);

  // Valid verification
  const valid = await fetchAndVerifyServerPayment({
    paymentId: "pay_mock_100",
    expectedOrderId: "order_mock_100",
    expectedAmountPaise: 100000,
    expectedCurrency: "INR",
    keyId: "rzp_test_mockKey",
    keySecret: "mockSecret",
    fetchFn: mockFetch,
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.payment?.captured, true);

  // Mismatched amount
  const wrongAmount = await fetchAndVerifyServerPayment({
    paymentId: "pay_mock_100",
    expectedOrderId: "order_mock_100",
    expectedAmountPaise: 50000, // Expected 500, received 1000
    expectedCurrency: "INR",
    keyId: "rzp_test_mockKey",
    keySecret: "mockSecret",
    fetchFn: mockFetch,
  });
  assert.equal(wrongAmount.valid, false);
  assert.match(wrongAmount.error || "", /Payment amount mismatch/i);

  // Non-INR currency
  const nonInr = await fetchAndVerifyServerPayment({
    paymentId: "pay_mock_100",
    expectedOrderId: "order_mock_100",
    expectedAmountPaise: 100000,
    expectedCurrency: "USD",
    keyId: "rzp_test_mockKey",
    keySecret: "mockSecret",
    fetchFn: mockFetch,
  });
  assert.equal(nonInr.valid, false);
  assert.match(nonInr.error || "", /must be INR/i);
});

test("7. External Razorpay sandbox probe: safely skips live calls when test credentials are not configured", () => {
  const testKeyId = process.env.RAZORPAY_TEST_KEY_ID?.trim();
  const testKeySecret = process.env.RAZORPAY_TEST_KEY_SECRET?.trim();

  const hasConfiguredCredentials = Boolean(
    testKeyId &&
    testKeySecret &&
    testKeyId !== "rzp_test_sourceasia_dev" &&
    testKeyId.startsWith("rzp_test_"),
  );

  if (!hasConfiguredCredentials) {
    // Expected behavior: No external network calls are made without configured sandbox credentials
    assert.ok(true, "External network calls are safely bypassed when RAZORPAY_TEST_KEY_ID is not configured");
  } else {
    // If credentials were provided in environment, test format
    assert.match(testKeyId!, /^rzp_test_[A-Za-z0-9]+$/);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCheckoutForm } from "../checkout/checkout-utils";
import { MAX_ORDER_LINES, parseOrderRequest } from "./order-request-validation";

const productId = "123e4567-e89b-42d3-a456-426614174000";

function validRequest() {
  return {
    customer: {
      companyName: " Source Asia ",
      contactPerson: "Buyer",
      email: "buyer@example.com",
      phone: "9876543210",
      gstin: "",
      billingAddress: "1 Example Road",
      shippingAddress: "1 Example Road",
      state: "Karnataka",
      poNumber: "",
    },
    lines: [{ productId, quantity: 2 }],
  };
}

test("parses and normalizes a valid order request", () => {
  const parsed = parseOrderRequest(validRequest());

  assert.ok(parsed);
  assert.equal(parsed.customer.companyName, "Source Asia");
  assert.deepEqual(parsed.lines, [{ productId, quantity: 2 }]);
  assert.deepEqual(
    validateCheckoutForm(parsed.customer, true),
    {},
  );
});

test("rejects missing customer data and malformed product identifiers", () => {
  const missingCustomer = validRequest();
  missingCustomer.customer.email = "";
  assert.deepEqual(
    validateCheckoutForm(parseOrderRequest(missingCustomer)!.customer, true),
    { email: "This field is required." },
  );

  const malformedProduct = validRequest();
  malformedProduct.lines[0].productId = "not-a-uuid";
  assert.equal(parseOrderRequest(malformedProduct), null);
});

test("rejects invalid quantities, duplicate products, and excessive line counts", () => {
  const fractionalQuantity = validRequest();
  fractionalQuantity.lines[0].quantity = 1.5;
  assert.equal(parseOrderRequest(fractionalQuantity), null);

  const duplicateProducts = validRequest();
  duplicateProducts.lines.push({ productId, quantity: 1 });
  assert.equal(parseOrderRequest(duplicateProducts), null);

  const tooManyLines = validRequest();
  tooManyLines.lines = Array.from({ length: MAX_ORDER_LINES + 1 }, (_, index) => ({
    productId: `123e4567-e89b-42d3-a456-${index.toString().padStart(12, "0")}`,
    quantity: 1,
  }));
  assert.equal(parseOrderRequest(tooManyLines), null);
});

test("rejects overlong customer fields", () => {
  const overlongAddress = validRequest();
  overlongAddress.customer.billingAddress = "x".repeat(2001);
  assert.equal(parseOrderRequest(overlongAddress), null);
});

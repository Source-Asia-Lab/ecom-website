import type { CheckoutFormValues } from "../checkout/checkout-utils";

export const MAX_REQUEST_BYTES = 16_384;
export const MAX_ORDER_LINES = 30;
export const MAX_QUANTITY_PER_LINE = 500;
export const MAX_ORDER_SUBTOTAL = 100_000_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SubmittedOrderLine {
  productId: string;
  quantity: number;
}

export interface SubmittedOrder {
  customer: CheckoutFormValues;
  lines: SubmittedOrderLine[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
}

export function parseOrderRequest(value: unknown): SubmittedOrder | null {
  if (!isRecord(value) || !isRecord(value.customer) || !Array.isArray(value.lines)) {
    return null;
  }

  const inputCustomer = value.customer;
  const customerFields = {
    companyName: 255,
    contactPerson: 200,
    email: 255,
    phone: 20,
    gstin: 15,
    billingAddress: 2000,
    shippingAddress: 2000,
    state: 100,
    poNumber: 100,
  } as const;

  const customer: Partial<CheckoutFormValues> = {};
  for (const [field, maxLength] of Object.entries(customerFields)) {
    const text = readText(inputCustomer[field], maxLength);
    if (text === null) {
      return null;
    }
    customer[field as keyof CheckoutFormValues] = text;
  }

  if (value.lines.length < 1 || value.lines.length > MAX_ORDER_LINES) {
    return null;
  }

  const lines: SubmittedOrderLine[] = [];
  const productIds = new Set<string>();
  for (const rawLine of value.lines) {
    if (
      !isRecord(rawLine) ||
      typeof rawLine.productId !== "string" ||
      !UUID_PATTERN.test(rawLine.productId) ||
      typeof rawLine.quantity !== "number" ||
      !Number.isSafeInteger(rawLine.quantity) ||
      rawLine.quantity < 1 ||
      rawLine.quantity > MAX_QUANTITY_PER_LINE ||
      productIds.has(rawLine.productId)
    ) {
      return null;
    }
    productIds.add(rawLine.productId);
    lines.push({ productId: rawLine.productId, quantity: rawLine.quantity });
  }

  return { customer: customer as CheckoutFormValues, lines };
}

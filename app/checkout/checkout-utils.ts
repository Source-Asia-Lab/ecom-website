import type { ResolvedCartLine } from "../store/cart-store";

export const SELLER_STATE = "Karnataka";
export const MOCK_GST_RATE = 0.18;

export interface CheckoutFormValues {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  gstin: string;
  billingAddress: string;
  shippingAddress: string;
  state: string;
  poNumber: string;
}

export type CheckoutErrors = Partial<Record<keyof CheckoutFormValues, string>>;

export interface GstBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  isInterstate: boolean;
}

export function calculateGst(subtotal: number, customerState: string): GstBreakdown {
  const taxTotal = Math.round(subtotal * MOCK_GST_RATE);
  const isInterstate = customerState.trim().toLowerCase() !== SELLER_STATE.toLowerCase();

  if (isInterstate) {
    return { cgst: 0, sgst: 0, igst: taxTotal, total: taxTotal, isInterstate };
  }

  const cgst = Math.floor(taxTotal / 2);
  const sgst = taxTotal - cgst;
  return { cgst, sgst, igst: 0, total: taxTotal, isInterstate };
}

export function validateCheckoutForm(
  values: CheckoutFormValues,
  sameAsBilling: boolean,
): CheckoutErrors {
  const errors: CheckoutErrors = {};
  const requiredFields: Array<keyof CheckoutFormValues> = [
    "companyName",
    "contactPerson",
    "email",
    "phone",
    "billingAddress",
    "state",
  ];

  if (!sameAsBilling) {
    requiredFields.push("shippingAddress");
  }

  for (const field of requiredFields) {
    if (!values[field].trim()) {
      errors[field] = "This field is required.";
    }
  }

  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (values.phone.trim()) {
    const digits = values.phone.replace(/\D/g, "");
    if (!/^(?:91)?[6-9]\d{9}$/.test(digits)) {
      errors.phone = "Enter a valid 10-digit mobile number.";
    }
  }

  if (values.gstin.trim()) {
    const gstin = values.gstin.trim().toUpperCase();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      errors.gstin = "Enter a valid GSTIN or leave this field blank.";
    }
  }

  return errors;
}

export interface CheckoutOrderDraft {
  customer: CheckoutFormValues;
  lines: Array<{
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  gst: GstBreakdown;
  total: number;
}

export function createCheckoutDraft(
  customer: CheckoutFormValues,
  lines: ResolvedCartLine[],
): CheckoutOrderDraft {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );
  const gst = calculateGst(subtotal, customer.state);

  return {
    customer: { ...customer },
    lines: lines.map(({ product, quantity }) => ({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * quantity,
    })),
    subtotal,
    gst,
    total: subtotal + gst.total,
  };
}

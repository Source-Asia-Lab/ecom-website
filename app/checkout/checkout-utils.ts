export const SELLER_STATE = "Karnataka";
export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

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

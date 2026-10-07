"use client";

import { useState } from "react";
import Link from "next/link";
import { LoadingState, PageContainer, TextLink } from "../components/ui";
import SiteFooter from "../components/site/SiteFooter";
import SiteHeader from "../components/site/SiteHeader";
import { resolveCartLines, useCartStore } from "../store/cart-store";
import { formatPrice } from "../store/products";
import {
  INDIAN_STATES,
  type CheckoutErrors,
  type CheckoutFormValues,
  validateCheckoutForm,
} from "./checkout-utils";

const initialValues: CheckoutFormValues = {
  companyName: "",
  contactPerson: "",
  email: "",
  phone: "",
  gstin: "",
  billingAddress: "",
  shippingAddress: "",
  state: "",
  poNumber: "",
};

interface CheckoutFieldProps {
  id: keyof CheckoutFormValues;
  label: string;
  value: string;
  error?: string;
  required?: boolean;
  type?: string;
  multiline?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  onChange: (value: string) => void;
}

function CheckoutField({
  id,
  label,
  value,
  error,
  required,
  type = "text",
  multiline,
  disabled,
  readOnly,
  autoComplete,
  onChange,
}: CheckoutFieldProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <label className="checkout-field" htmlFor={id}>
      <span>{label} {required && <i>*</i>}</span>
      {multiline ? (
        <textarea
          id={id}
          className="ui-input checkout-textarea"
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className="ui-input"
          type={type}
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error && <span className="checkout-error" id={errorId}>{error}</span>}
    </label>
  );
}

export default function CheckoutPage() {
  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const clearCart = useCartStore((state) => state.clearCart);
  const lines = resolveCartLines(items);
  const [values, setValues] = useState(initialValues);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const subtotal = lines.reduce(
    (total, line) => total + line.product.price * line.quantity,
    0,
  );

  if (!hasHydrated) {
    return (
      <div className="landing-page">
        <SiteHeader currentPage="store" />
        <main className="checkout-page">
          <PageContainer className="checkout-page__container">
            <LoadingState label="Loading saved cart" />
          </PageContainer>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const updateField = (field: keyof CheckoutFormValues, value: string) => {
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "billingAddress" && sameAsBilling
        ? { shippingAddress: value }
        : {}),
    }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFeedback("");
    setOrderNumber(null);
  };

  const updateSameAsBilling = (checked: boolean) => {
    setSameAsBilling(checked);
    setErrors((current) => ({ ...current, shippingAddress: undefined }));
    if (checked) {
      setValues((current) => ({ ...current, shippingAddress: current.billingAddress }));
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    setOrderNumber(null);

    if (lines.length === 0) {
      setFeedback("Your cart is empty. Add products before continuing.");
      return;
    }

    if (lines.some(({ product, quantity }) => product.stock <= 0 || quantity > product.stock)) {
      setFeedback("One or more products are no longer available in the requested quantity.");
      return;
    }

    const nextErrors = validateCheckoutForm(values, sameAsBilling);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFeedback("Review the highlighted fields to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            ...values,
            email: values.email.trim(),
            phone: values.phone.trim(),
            gstin: values.gstin.trim().toUpperCase(),
            shippingAddress: sameAsBilling ? values.billingAddress : values.shippingAddress,
          },
          lines: lines.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
          })),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" ||
          !("orderNumber" in result) || typeof result.orderNumber !== "string") {
        const message = result && typeof result === "object" && "error" in result &&
          typeof result.error === "string"
          ? result.error
          : "We could not submit the order request. Please try again.";
        setFeedback(message);
        return;
      }

      setOrderNumber(result.orderNumber);
      setFeedback("Your order request was saved. It is pending review; no payment was taken and inventory was not reserved.");
      clearCart();
    } catch {
      setFeedback("We could not connect to the order service. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderNumber) {
    return (
      <div className="landing-page">
        <SiteHeader currentPage="store" />
        <main className="checkout-page">
          <PageContainer className="checkout-empty">
            <span className="section-heading__eyebrow">Order request received</span>
            <h1>Thank you.</h1>
            <p>{feedback}</p>
            <p><strong>Reference: {orderNumber}</strong></p>
            <Link className="checkout-primary" href="/store">Continue Shopping</Link>
          </PageContainer>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="landing-page">
        <SiteHeader currentPage="store" />
        <main className="checkout-page">
          <PageContainer className="checkout-empty">
            <span className="section-heading__eyebrow">Order request</span>
            <h1>Your cart is empty.</h1>
            <p>Add products to your cart before starting checkout.</p>
            <Link className="checkout-primary" href="/store">Continue Shopping</Link>
          </PageContainer>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="landing-page">
      <SiteHeader currentPage="store" />
      <main className="checkout-page">
        <PageContainer className="checkout-page__container">
          <div className="checkout-page__heading">
            <p className="section-heading__eyebrow">Source Asia Direct</p>
            <h1>Request an Order</h1>
            <p>Submit your details for review. This does not take payment or reserve stock.</p>
          </div>

          <form className="checkout-layout" onSubmit={handleSubmit} noValidate>
            <div className="checkout-fields">
              <section className="checkout-panel" aria-labelledby="company-details-title">
                <h2 id="company-details-title">Company details</h2>
                <div className="checkout-field-grid">
                  <CheckoutField id="companyName" label="Company Name" required value={values.companyName} error={errors.companyName} onChange={(value) => updateField("companyName", value)} />
                  <CheckoutField id="contactPerson" label="Contact Person" required value={values.contactPerson} error={errors.contactPerson} onChange={(value) => updateField("contactPerson", value)} />
                  <CheckoutField id="email" label="Email" required type="email" autoComplete="email" value={values.email} error={errors.email} onChange={(value) => updateField("email", value)} />
                  <CheckoutField id="phone" label="Phone" required type="tel" autoComplete="tel" value={values.phone} error={errors.phone} onChange={(value) => updateField("phone", value)} />
                  <CheckoutField id="gstin" label="GSTIN" value={values.gstin} error={errors.gstin} onChange={(value) => updateField("gstin", value.toUpperCase())} />
                  <CheckoutField id="poNumber" label="PO Number" value={values.poNumber} onChange={(value) => updateField("poNumber", value)} />
                  <div className="checkout-field--wide">
                    <CheckoutField id="billingAddress" label="Billing Address" required multiline autoComplete="billing street-address" value={values.billingAddress} error={errors.billingAddress} onChange={(value) => updateField("billingAddress", value)} />
                  </div>
                  <label className="checkout-field" htmlFor="state">
                    <span>State <i>*</i></span>
                    <select id="state" className="ui-select" value={values.state} aria-invalid={Boolean(errors.state)} aria-describedby={errors.state ? "state-error" : undefined} onChange={(event) => updateField("state", event.target.value)}>
                      <option value="">Select state</option>
                      {INDIAN_STATES.map((state) => <option value={state} key={state}>{state}</option>)}
                    </select>
                    {errors.state && <span className="checkout-error" id="state-error">{errors.state}</span>}
                  </label>
                </div>
                <label className="checkout-checkbox">
                  <input type="checkbox" checked={sameAsBilling} onChange={(event) => updateSameAsBilling(event.target.checked)} />
                  Shipping address same as billing
                </label>
                <CheckoutField
                  id="shippingAddress"
                  label="Shipping Address"
                  required={!sameAsBilling}
                  multiline
                  autoComplete="shipping street-address"
                  value={values.shippingAddress}
                  error={errors.shippingAddress}
                  readOnly={sameAsBilling}
                  disabled={sameAsBilling}
                  onChange={(value) => updateField("shippingAddress", value)}
                />
              </section>

              {feedback && (
                <p className="checkout-feedback" role="status">
                  {feedback}
                </p>
              )}
            </div>

            <aside className="checkout-summary" aria-labelledby="order-summary-title">
              <h2 id="order-summary-title">Order summary</h2>
              <div className="checkout-summary__lines">
                {lines.map(({ product, quantity }) => (
                  <div className="checkout-summary__item" key={product.id}>
                    <div>
                      <strong>{product.name}</strong>
                      <span>{quantity} × {formatPrice(product.price)}</span>
                    </div>
                    <strong>{formatPrice(product.price * quantity)}</strong>
                  </div>
                ))}
              </div>
              <div className="checkout-summary__totals">
                <div><span>Subtotal estimate</span><strong>{formatPrice(subtotal)}</strong></div>
              </div>
              <p className="checkout-summary__note">Final prices, stock, and applicable tax are confirmed by the Source Asia team. This request does not reserve inventory.</p>
              <button className="checkout-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Order Request"}
              </button>
              <TextLink className="checkout-continue" href="/store">Continue Shopping</TextLink>
            </aside>
          </form>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
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

interface SavedAddress {
  id: string;
  address_type: string;
  full_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  is_default: boolean;
}

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

// Visual Dummy UPI QR Component
function DummyUPIQRCode({ upiId, amount, name }: { upiId: string; amount: number; name?: string }) {
  return (
    <div className="upi-qr-card" style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      background: "#ffffff",
      padding: "24px",
      borderRadius: "16px",
      border: "1px solid #e2e8f0",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
      maxWidth: "340px",
      margin: "0 auto",
      textAlign: "center"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <span style={{ fontWeight: 700, fontSize: "16px", color: "#1e293b", letterSpacing: "-0.02em" }}>
          {name || "SOURCE ASIA"}
        </span>
        <span style={{ fontSize: "11px", background: "#f1f5f9", padding: "2px 8px", borderRadius: "12px", color: "#475569" }}>
          UPI TEST
        </span>
      </div>

      <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: "8px" }}>
        {/* Outer White Background */}
        <rect width="200" height="200" fill="white" />
        {/* Finder Pattern Top-Left */}
        <rect x="15" y="15" width="45" height="45" rx="6" fill="#0f172a" />
        <rect x="22" y="22" width="31" height="31" rx="4" fill="white" />
        <rect x="29" y="29" width="17" height="17" rx="2" fill="#0f172a" />
        {/* Finder Pattern Top-Right */}
        <rect x="140" y="15" width="45" height="45" rx="6" fill="#0f172a" />
        <rect x="147" y="22" width="31" height="31" rx="4" fill="white" />
        <rect x="154" y="29" width="17" height="17" rx="2" fill="#0f172a" />
        {/* Finder Pattern Bottom-Left */}
        <rect x="15" y="140" width="45" height="45" rx="6" fill="#0f172a" />
        <rect x="22" y="147" width="31" height="31" rx="4" fill="white" />
        <rect x="29" y="154" width="17" height="17" rx="2" fill="#0f172a" />
        {/* Realistic Grid Data Elements */}
        <rect x="70" y="20" width="10" height="10" rx="1" fill="#0f172a" />
        <rect x="90" y="20" width="20" height="10" rx="1" fill="#0f172a" />
        <rect x="120" y="20" width="10" height="10" rx="1" fill="#0f172a" />
        <rect x="70" y="40" width="30" height="10" rx="1" fill="#0f172a" />
        <rect x="110" y="40" width="20" height="10" rx="1" fill="#0f172a" />
        <rect x="20" y="70" width="20" height="10" rx="1" fill="#0f172a" />
        <rect x="50" y="70" width="10" height="20" rx="1" fill="#0f172a" />
        <rect x="70" y="70" width="60" height="60" rx="4" fill="#0284c7" />
        <rect x="80" y="80" width="40" height="40" rx="4" fill="white" />
        {/* Center UPI Logo in QR */}
        <path d="M93 90L107 100L93 110V90Z" fill="#0284c7" />
        <rect x="140" y="70" width="20" height="10" rx="1" fill="#0f172a" />
        <rect x="170" y="70" width="10" height="20" rx="1" fill="#0f172a" />
        <rect x="20" y="110" width="30" height="10" rx="1" fill="#0f172a" />
        <rect x="70" y="140" width="20" height="20" rx="1" fill="#0f172a" />
        <rect x="100" y="140" width="30" height="10" rx="1" fill="#0f172a" />
        <rect x="140" y="140" width="10" height="20" rx="1" fill="#0f172a" />
        <rect x="160" y="140" width="20" height="10" rx="1" fill="#0f172a" />
        <rect x="90" y="170" width="40" height="10" rx="1" fill="#0f172a" />
        <rect x="140" y="170" width="20" height="15" rx="1" fill="#0f172a" />
        <rect x="170" y="165" width="15" height="20" rx="1" fill="#0f172a" />
      </svg>

      <div style={{ marginTop: "16px", fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
        ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </div>
      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
        UPI ID: {upiId}
      </div>
      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "8px" }}>
        Scan with Google Pay, PhonePe, Paytm, or BHIM
      </div>
    </div>
  );
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 11);
  return `idem-${timestamp}-${randomPart}`;
}

export default function CheckoutPage() {
  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const clearCart = useCartStore((state) => state.clearCart);
  const lines = resolveCartLines(items);

  const [values, setValues] = useState(initialValues);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [saveAddressToAccount, setSaveAddressToAccount] = useState(true);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment state
  const idempotencyKeyRef = useRef<string | null>(null);

  const [orderData, setOrderData] = useState<{
    orderId: string;
    orderNumber: string;
    subtotal: number;
    taxAmount: number | null;
    total: number | null;
    expiresAt: string;
  } | null>(null);

  const [razorpayOrder, setRazorpayOrder] = useState<{
    razorpayOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
  } | null>(null);

  const [paymentStatus, setPaymentStatus] = useState<"PENDING" | "PAID" | "EXPIRED">("PENDING");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(600); // 10 minutes

  const subtotal = lines.reduce(
    (total, line) => total + line.product.price * line.quantity,
    0,
  );

  // Load saved addresses and profile on mount
  useEffect(() => {
    let isMounted = true;
    async function loadAccountData() {
      try {
        const [profileRes, addressesRes] = await Promise.all([
          fetch("/api/account/profile").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/account/addresses").then((r) => (r.ok ? r.json() : null)),
        ]);

        if (!isMounted) return;

        if (profileRes && typeof profileRes === "object") {
          setValues((prev) => ({
            ...prev,
            companyName: profileRes.companyName || prev.companyName,
            contactPerson: [profileRes.firstName, profileRes.lastName].filter(Boolean).join(" ") || prev.contactPerson,
            email: profileRes.email || prev.email,
            phone: profileRes.phone || prev.phone,
            gstin: profileRes.gstin || prev.gstin,
          }));
        }

        if (addressesRes?.addresses && Array.isArray(addressesRes.addresses) && addressesRes.addresses.length > 0) {
          setSavedAddresses(addressesRes.addresses);
          const defaultAddr = addressesRes.addresses.find((a: SavedAddress) => a.is_default) || addressesRes.addresses[0];
          if (defaultAddr) {
            setSelectedAddressId(defaultAddr.id);
            setValues((prev) => ({
              ...prev,
              contactPerson: prev.contactPerson || defaultAddr.full_name,
              phone: prev.phone || defaultAddr.phone,
              billingAddress: `${defaultAddr.address_line_1}${defaultAddr.address_line_2 ? ", " + defaultAddr.address_line_2 : ""}, ${defaultAddr.city} - ${defaultAddr.postal_code}`,
              shippingAddress: `${defaultAddr.address_line_1}${defaultAddr.address_line_2 ? ", " + defaultAddr.address_line_2 : ""}, ${defaultAddr.city} - ${defaultAddr.postal_code}`,
              state: defaultAddr.state,
            }));
          }
        }
      } catch (err) {
        console.error("Account auto-fill error:", err);
      }
    }
    void loadAccountData();
    return () => {
      isMounted = false;
    };
  }, []);

  // 10-Minute Hold Countdown Timer
  useEffect(() => {
    if (!orderData?.expiresAt || paymentStatus === "PAID") return;

    const expiresTime = new Date(orderData.expiresAt).getTime();

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        setPaymentStatus("EXPIRED");
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [orderData, paymentStatus]);

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

  const handleSelectSavedAddress = (addressId: string) => {
    setSelectedAddressId(addressId);
    const addr = savedAddresses.find((a) => a.id === addressId);
    if (!addr) return;

    const formattedAddress = `${addr.address_line_1}${addr.address_line_2 ? ", " + addr.address_line_2 : ""}, ${addr.city} - ${addr.postal_code}`;
    setValues((prev) => ({
      ...prev,
      contactPerson: addr.full_name || prev.contactPerson,
      phone: addr.phone || prev.phone,
      billingAddress: formattedAddress,
      shippingAddress: formattedAddress,
      state: addr.state,
    }));
  };

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
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = generateIdempotencyKey();
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKeyRef.current,
      };

      const response = await fetch("/api/orders", {
        method: "POST",
        headers,
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

      const result = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !result.orderNumber) {
        setFeedback(result?.error || "We could not submit the order request. Please try again.");
        return;
      }

      // Reset idempotency key for any future orders
      idempotencyKeyRef.current = null;

      // Save address if opted in
      if (saveAddressToAccount) {
        void fetch("/api/account/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: values.contactPerson,
            phone: values.phone,
            addressLine1: values.billingAddress,
            city: values.state,
            state: values.state,
            postalCode: "560001",
            isDefault: savedAddresses.length === 0,
          }),
        }).catch(() => undefined);
      }

      setOrderData({
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        subtotal: result.subtotal,
        taxAmount: result.taxAmount,
        total: result.total,
        expiresAt: result.expiresAt,
      });

      // Initialize Razorpay order
      const rzpRes = await fetch("/api/checkout/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: result.orderNumber,
          customerEmail: values.email,
          customerPhone: values.phone,
        }),
      });
      if (rzpRes.ok) {
        const rzpData = await rzpRes.json();
        setRazorpayOrder(rzpData);
      }

      clearCart();
    } catch {
      setFeedback("We could not connect to the order service. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!orderData || !razorpayOrder) return;
    setPaymentLoading(true);

    try {
      const res = await fetch("/api/checkout/razorpay/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: orderData.orderNumber,
          razorpayOrderId: razorpayOrder.razorpayOrderId,
          customerEmail: values.email,
          customerPhone: values.phone,
          isSimulated: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPaymentStatus("PAID");
      } else {
        setFeedback(data.error || "Payment verification failed.");
      }
    } catch {
      setFeedback("Could not complete payment verification.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeDisplay = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // If order created, show the Payment Screen
  if (orderData) {
    return (
      <div className="landing-page">
        <SiteHeader currentPage="store" />
        <main className="checkout-page">
          <PageContainer className="checkout-page__container" style={{ maxWidth: "780px" }}>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <span className="section-heading__eyebrow" style={{ color: "#0284c7" }}>
                {paymentStatus === "PAID" ? "Order Confirmed" : "Complete Payment"}
              </span>
              <h1 style={{ fontSize: "28px", marginTop: "8px", color: "#0f172a" }}>
                {paymentStatus === "PAID" ? "Payment Successful!" : "Order Reserved & Awaiting Payment"}
              </h1>
              <p style={{ color: "#64748b", marginTop: "4px" }}>
                Order Reference: <strong>{orderData.orderNumber}</strong>
              </p>
            </div>

            {paymentStatus === "PAID" ? (
              <div style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "16px",
                padding: "32px",
                textAlign: "center"
              }}>
                <div style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "#22c55e",
                  color: "#ffffff",
                  fontSize: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px"
                }}>
                  ✓
                </div>
                <h2 style={{ fontSize: "22px", color: "#166534" }}>Thank You For Your Order</h2>
                <p style={{ color: "#15803d", marginTop: "8px", maxWidth: "480px", margin: "8px auto 24px" }}>
                  Your payment of ₹{Number(orderData.total || orderData.subtotal).toFixed(2)} has been verified.
                  Inventory reservation has been confirmed and our warehouse team is preparing your package.
                </p>

                {/* Delivery Tracking Stepper */}
                <div style={{
                  background: "#ffffff",
                  borderRadius: "12px",
                  padding: "20px",
                  border: "1px solid #dcfce7",
                  margin: "24px 0",
                  textAlign: "left"
                }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#166534", marginBottom: "16px" }}>
                    Fulfillment Progress
                  </h3>
                  <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
                    {[
                      { label: "Confirmed", done: true },
                      { label: "Processing", done: false },
                      { label: "Packaged", done: false },
                      { label: "In Transit", done: false },
                      { label: "Delivered", done: false },
                    ].map((step, idx) => (
                      <div key={step.label} style={{ textAlign: "center", flex: 1 }}>
                        <div style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: step.done ? "#22c55e" : "#e2e8f0",
                          color: step.done ? "#ffffff" : "#64748b",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto 6px",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}>
                          {step.done ? "✓" : idx + 1}
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: step.done ? 600 : 400, color: step.done ? "#15803d" : "#64748b" }}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
                  <Link
                    className="checkout-primary"
                    href={`/api/orders/${orderData.orderNumber}/track`}
                    target="_blank"
                    style={{ background: "#16a34a" }}
                  >
                    View Shipment Tracking JSON
                  </Link>
                  <Link className="checkout-primary" href="/store" style={{ background: "#0f172a" }}>
                    Continue Shopping
                  </Link>
                </div>
              </div>
            ) : paymentStatus === "EXPIRED" ? (
              <div style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "16px",
                padding: "32px",
                textAlign: "center"
              }}>
                <h2 style={{ color: "#991b1b" }}>Payment Window Expired</h2>
                <p style={{ color: "#b91c1c", marginTop: "8px" }}>
                  The 10-minute hold reservation for this order has timed out to make inventory available for other buyers.
                </p>
                <Link className="checkout-primary" href="/store" style={{ marginTop: "16px", display: "inline-block" }}>
                  Return to Store
                </Link>
              </div>
            ) : (
              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 4px 20px -2px rgba(0,0,0,0.05)"
              }}>
                {/* Hold Banner */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  padding: "12px 20px",
                  borderRadius: "10px",
                  marginBottom: "24px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" }} />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#166534" }}>
                      Stock Reserved (10-Min Hold)
                    </span>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#15803d", fontVariantNumeric: "tabular-nums" }}>
                    ⏱ {timeDisplay}
                  </div>
                </div>

                {/* Amount breakdown */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "16px 0",
                  borderBottom: "1px solid #f1f5f9",
                  marginBottom: "24px"
                }}>
                  <div>
                    <span style={{ fontSize: "13px", color: "#64748b" }}>Amount Payable</span>
                    <h2 style={{ fontSize: "28px", color: "#0f172a", fontWeight: 700 }}>
                      ₹{Number(orderData.total || orderData.subtotal).toFixed(2)}
                    </h2>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "12px", background: "#f8fafc", padding: "4px 8px", borderRadius: "6px", color: "#64748b" }}>
                      Gateway: Razorpay Test / UPI
                    </span>
                  </div>
                </div>

                {/* Simulated UPI QR Section */}
                <div style={{ marginBottom: "24px" }}>
                  <DummyUPIQRCode
                    upiId="sourceasia@razorpay"
                    amount={Number(orderData.total || orderData.subtotal)}
                    name="Source Asia Storefront"
                  />
                </div>

                {/* Simulator Action Button */}
                <div style={{ textAlign: "center" }}>
                  <button
                    type="button"
                    className="checkout-primary"
                    disabled={paymentLoading}
                    onClick={() => void handleSimulatePayment()}
                    style={{
                      width: "100%",
                      maxWidth: "340px",
                      background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                      fontSize: "15px",
                      fontWeight: 600,
                      padding: "14px",
                      borderRadius: "10px"
                    }}
                  >
                    {paymentLoading ? "Confirming Payment..." : "⚡ Simulate Successful Payment (UPI / Test)"}
                  </button>
                  <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "12px" }}>
                    Development Test Mode: One-click simulation confirms order, transitions status to CONFIRMED / PAID, and commits inventory reservations.
                  </p>
                </div>
              </div>
            )}
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
            <h1>Place Your Order</h1>
            <p>Enter your delivery details. Stock will be reserved for 10 minutes upon checkout initiation.</p>
          </div>

          {savedAddresses.length > 0 && (
            <div style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "24px"
            }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                Saved Addresses
              </h3>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {savedAddresses.map((addr) => (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => handleSelectSavedAddress(addr.id)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: selectedAddressId === addr.id ? "2px solid #0284c7" : "1px solid #cbd5e1",
                      background: selectedAddressId === addr.id ? "#f0f9ff" : "#ffffff",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                  >
                    <strong style={{ display: "block", fontSize: "13px", color: "#0f172a" }}>
                      {addr.full_name} {addr.is_default ? "(Default)" : ""}
                    </strong>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {addr.address_line_1}, {addr.city}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form className="checkout-layout" onSubmit={handleSubmit} noValidate>
            <div className="checkout-fields">
              <section className="checkout-panel" aria-labelledby="company-details-title">
                <h2 id="company-details-title">Company & Delivery details</h2>
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

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "16px 0" }}>
                  <label className="checkout-checkbox">
                    <input type="checkbox" checked={sameAsBilling} onChange={(event) => updateSameAsBilling(event.target.checked)} />
                    Shipping address same as billing
                  </label>
                  <label className="checkout-checkbox">
                    <input type="checkbox" checked={saveAddressToAccount} onChange={(event) => setSaveAddressToAccount(event.target.checked)} />
                    Save this address to my account for faster future checkout
                  </label>
                </div>

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
                <div><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
                <div><span>GST / Tax</span><strong>Included / At Checkout</strong></div>
              </div>
              <p className="checkout-summary__note" style={{ color: "#166534", background: "#f0fdf4", padding: "8px 12px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                ⚡ Submitting will reserve stock for 10 minutes while you complete online payment.
              </p>
              <button className="checkout-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Reserving & Proceeding..." : "Proceed to Payment"}
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

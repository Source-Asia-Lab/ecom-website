/**
 * Shared delivery-status display helpers.
 * Single source of truth for the customer-facing order journey:
 * Confirmed -> Processing -> Packaged -> In transit -> Delivered.
 * Used by the checkout success screen, the tracking page, and the account
 * modal so all views show identical, accurate statuses.
 */

export const DELIVERY_STEPS = [
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PROCESSING", label: "Processing" },
  { key: "PACKAGED", label: "Packaged" },
  { key: "IN_TRANSIT", label: "In transit" },
  { key: "DELIVERED", label: "Delivered" },
] as const;

export type DeliveryStepKey = (typeof DELIVERY_STEPS)[number]["key"];

/** Order states that map onto the delivery journey (SHIPPED counts as IN_TRANSIT). */
const STEP_ORDER: Record<string, number> = {
  CONFIRMED: 0,
  PROCESSING: 1,
  PACKAGED: 2,
  IN_TRANSIT: 3,
  SHIPPED: 3, // legacy alias of IN_TRANSIT
  DELIVERED: 4,
};

export interface OrderTrackingView {
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  shipment: {
    status: string | null;
    carrierName: string | null;
    awbNumber: string | null;
    trackingUrl: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    notes: string | null;
  } | null;
}

/** Index into DELIVERY_STEPS of the furthest step reached, or -1 when pre-confirmation. */
export function currentStepIndex(orderStatus: string): number {
  return STEP_ORDER[orderStatus.toUpperCase()] ?? -1;
}

/** Human-readable status label for any order/shipment status value. */
export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Awaiting payment",
    IN_REVIEW: "In review",
    PAYMENT_REVIEW: "Payment review",
    CONFIRMED: "Confirmed",
    PROCESSING: "Processing",
    PACKAGED: "Packaged",
    IN_TRANSIT: "In transit",
    SHIPPED: "In transit",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
    REJECTED: "Rejected",
    FAILED: "Delivery failed",
  };
  return labels[status.toUpperCase()] || status;
}

/** Presentational color per status (Tailwind-free inline values shared by views). */
export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: "#b45309",
    IN_REVIEW: "#1d4ed8",
    PAYMENT_REVIEW: "#b45309",
    CONFIRMED: "#15803d",
    PROCESSING: "#0369a1",
    PACKAGED: "#7c3aed",
    IN_TRANSIT: "#0369a1",
    SHIPPED: "#0369a1",
    DELIVERED: "#15803d",
    CANCELLED: "#b91c1c",
    REJECTED: "#b91c1c",
    FAILED: "#b91c1c",
  };
  return colors[status.toUpperCase()] || "#475569";
}

/**
 * Step completion state for the journey stepper.
 * -1 (or terminal failure states) renders all steps as pending.
 */
export function stepStates(orderStatus: string): Array<{ label: string; done: boolean; active: boolean }> {
  const reached = currentStepIndex(orderStatus);
  const failed = ["CANCELLED", "REJECTED", "FAILED"].includes(orderStatus.toUpperCase());
  return DELIVERY_STEPS.map((step, idx) => ({
    label: step.label,
    done: !failed && reached >= idx,
    active: !failed && reached === idx,
  }));
}

/** Map a track-API response into the shared view model. */
export function toTrackingView(api: {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  totalAmount: number;
  createdAt: string;
  shipments: Array<{
    status: string;
    carrierName: string | null;
    awbNumber: string | null;
    trackingUrl: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    notes: string | null;
    createdAt: string;
  }>;
}): OrderTrackingView {
  const latest = api.shipments[0] ?? null;
  return {
    orderNumber: api.orderNumber,
    orderStatus: api.status,
    paymentStatus: api.paymentStatus,
    currency: api.currency,
    totalAmount: api.totalAmount,
    createdAt: api.createdAt,
    shipment: latest
      ? {
          status: latest.status,
          carrierName: latest.carrierName,
          awbNumber: latest.awbNumber,
          trackingUrl: latest.trackingUrl,
          shippedAt: latest.shippedAt,
          deliveredAt: latest.deliveredAt,
          notes: latest.notes,
        }
      : null,
  };
}

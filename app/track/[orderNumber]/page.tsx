import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "../../components/ui";
import SiteHeader from "../../components/site/SiteHeader";
import SiteFooter from "../../components/site/SiteFooter";
import { ecommerceQuery } from "../../lib/db";
import {
  stepStates,
  statusColor,
  statusLabel,
} from "../../lib/delivery-status";

export const metadata: Metadata = {
  title: "Track your order | Source Asia",
  description: "Live delivery status for your Source Asia order.",
};

export const dynamic = "force-dynamic";

interface TrackPageProps {
  params: Promise<{ orderNumber: string }>;
}

interface ShipmentRow {
  carrier_name: string | null;
  awb_number: string | null;
  tracking_url: string | null;
  status: string;
  shipped_at: string | Date | null;
  delivered_at: string | Date | null;
  notes: string | null;
}

function formatDate(value: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default async function TrackOrderPage({ params }: TrackPageProps) {
  const { orderNumber: raw } = await params;
  const orderNumber = decodeURIComponent(raw).trim();

  const valid = /^ECOM-\d{4}-\d+$/i.test(orderNumber);

  let order: {
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    currency: string;
    total_amount: string | number;
    created_at: string | Date;
  } | null = null;
  let shipment: ShipmentRow | null = null;
  let loadError: string | null = null;

  if (valid) {
    try {
      const orderRes = await ecommerceQuery<{
        id: string;
        order_number: string;
        status: string;
        payment_status: string;
        currency: string;
        total_amount: string | number;
        created_at: string | Date;
      }>(
        `SELECT id, order_number, status, payment_status, currency, total_amount, created_at
         FROM public.ecom_orders WHERE order_number = $1`,
        [orderNumber],
      );
      order = orderRes.rows[0] ?? null;
      if (order) {
        const shipRes = await ecommerceQuery<ShipmentRow>(
          `SELECT carrier_name, awb_number, tracking_url, status, shipped_at, delivered_at, notes
           FROM public.ecom_shipments
           WHERE ecom_order_id = $1
           ORDER BY created_at DESC LIMIT 1`,
          [order.id],
        );
        shipment = shipRes.rows[0] ?? null;
      }
    } catch {
      loadError = "Could not load order tracking right now. Please try again shortly.";
    }
  }

  const steps = order ? stepStates(order.status) : [];
  const isTerminalBad = order ? ["CANCELLED", "REJECTED", "FAILED"].includes(order.status.toUpperCase()) : false;

  return (
    <div className="landing-page">
      <SiteHeader currentPage="store" />
      <main className="checkout-page">
        <PageContainer className="checkout-page__container" style={{ maxWidth: "720px" }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <span className="section-heading__eyebrow" style={{ color: "#0284c7" }}>Order Tracking</span>
            <h1 style={{ fontSize: "28px", marginTop: "8px", color: "#0f172a" }}>
              {order ? `Order ${order.order_number}` : "Track your order"}
            </h1>
            {order && (
              <p style={{ color: "#64748b", marginTop: "4px" }}>
                Placed {formatDate(order.created_at)} ·{" "}
                {new Intl.NumberFormat("en-IN", { style: "currency", currency: order.currency }).format(Number(order.total_amount))}
              </p>
            )}
          </div>

          {!valid && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
              <h2 style={{ color: "#991b1b", fontSize: "20px" }}>Invalid order number</h2>
              <p style={{ color: "#b91c1c", marginTop: "8px" }}>
                Order numbers look like ECOM-2026-123. Check your confirmation email or receipt.
              </p>
            </div>
          )}

          {valid && loadError && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
              <p style={{ color: "#92400e" }}>{loadError}</p>
            </div>
          )}

          {valid && !loadError && !order && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
              <h2 style={{ color: "#991b1b", fontSize: "20px" }}>Order not found</h2>
              <p style={{ color: "#b91c1c", marginTop: "8px" }}>
                We could not find an order with that number. Double-check and try again.
              </p>
            </div>
          )}

          {order && (
            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "28px" }}>
              {/* Current status chip */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <span
                  style={{
                    display: "inline-block", padding: "6px 14px", borderRadius: "999px",
                    background: isTerminalBad ? "#fef2f2" : "#f0fdf4",
                    border: `1px solid ${isTerminalBad ? "#fecaca" : "#bbf7d0"}`,
                    color: statusColor(order.status), fontWeight: 700, fontSize: "14px",
                  }}
                >
                  {statusLabel(order.status)}
                </span>
                <span style={{ fontSize: "13px", color: "#64748b" }}>
                  Payment: {order.payment_status === "PAID" ? "Paid ✓" : order.payment_status}
                </span>
              </div>

              {/* Delivery stepper */}
              {!isTerminalBad && (
                <div style={{ marginBottom: "28px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
                    {steps.map((step, idx) => (
                      <div key={step.label} style={{ textAlign: "center", flex: 1 }}>
                        <div style={{
                          width: "30px", height: "30px", borderRadius: "50%",
                          background: step.done ? "#22c55e" : step.active ? "#0284c7" : "#e2e8f0",
                          color: step.done || step.active ? "#ffffff" : "#64748b",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          margin: "0 auto 6px", fontSize: "13px", fontWeight: 700,
                        }}>
                          {step.done ? "✓" : idx + 1}
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: step.active ? 700 : 400, color: step.active ? "#0369a1" : step.done ? "#15803d" : "#64748b" }}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shipment details */}
              {shipment ? (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", fontSize: "13px", lineHeight: 1.9, color: "#334155" }}>
                  <div><strong>Shipment status:</strong> {statusLabel(shipment.status)}</div>
                  {shipment.carrier_name && <div><strong>Carrier:</strong> {shipment.carrier_name}</div>}
                  {shipment.awb_number && <div><strong>AWB / tracking number:</strong> {shipment.awb_number}</div>}
                  <div><strong>Shipped at:</strong> {formatDate(shipment.shipped_at)}</div>
                  <div><strong>Delivered at:</strong> {formatDate(shipment.delivered_at)}</div>
                  {shipment.notes && <div><strong>Notes:</strong> {shipment.notes}</div>}
                  {shipment.tracking_url && (
                    <div style={{ marginTop: "8px" }}>
                      <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1", fontWeight: 600 }}>
                        Track on carrier website ↗
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                !isTerminalBad && (
                  <p style={{ fontSize: "13px", color: "#64748b", background: "#f8fafc", padding: "14px", borderRadius: "10px" }}>
                    A shipment record will appear here once your order is packaged and handed to the carrier.
                  </p>
                )
              )}

              <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "24px" }}>
                <Link className="checkout-primary" href="/store">Continue shopping</Link>
              </div>
              <p style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center", marginTop: "12px" }}>
                This page updates automatically as our team processes your order — refresh to see the latest status.
              </p>
            </div>
          )}
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}

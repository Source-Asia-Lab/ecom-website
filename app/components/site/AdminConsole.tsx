"use client";

import { useEffect, useState } from "react";

interface OrderRequest {
  order_number: string;
  status: string;
  payment_status: string;
  currency: string;
  total_amount: string | number;
  billing_address_snapshot: { companyName?: string; contactPerson?: string; email?: string; phone?: string };
  created_at: string;
}

interface CatalogProduct {
  product_id: string;
  name: string;
  sku: string;
  sale_price: string | number | null;
  is_published: boolean;
  category_id: string;
  category_name: string;
  category_is_active: boolean;
  type_name: string | null;
  type_is_active: boolean | null;
  product_is_active: boolean;
  name_override: string | null;
  description_override: string | null;
  price_override: string | number | null;
  image_url_override: string | null;
  stock_override: number | null;
  erp_stock: number;
  effective_stock: number;
}

interface CatalogCategory {
  id: string;
  name: string;
}

interface AvailableErpProduct {
  productId: string;
  name: string;
  sku: string;
}

interface RefundRequest {
  id: string;
  order_number: string;
  amount: string | number;
  reason: string;
  status: string;
  external_reference: string | null;
}

interface SupportTicket {
  ticket_number: string;
  order_number: string | null;
  customer_name: string;
  customer_email: string;
  subject: string;
  category: string;
  message: string;
  status: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

export default function AdminConsole() {
  const [orders, setOrders] = useState<OrderRequest[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
  const [availableProducts, setAvailableProducts] = useState<AvailableErpProduct[]>([]);
  const [message, setMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");

  async function reload() {
    try {
      const [ordersResult, productsResult, refundsResult, ticketsResult] = await Promise.all([
        fetch("/api/admin/orders", { cache: "no-store" }).then(readJson<{ orders: OrderRequest[] }>),
        fetch("/api/admin/catalog", { cache: "no-store" }).then(readJson<{
          products: CatalogProduct[];
          categories: CatalogCategory[];
          availableProducts: AvailableErpProduct[];
        }>),
        fetch("/api/admin/refunds", { cache: "no-store" }).then(readJson<{ refunds: RefundRequest[] }>),
        fetch("/api/admin/support/tickets?status=OPEN,IN_PROGRESS,WAITING_CUSTOMER", { cache: "no-store" }).then(readJson<{ tickets: SupportTicket[] }>),
      ]);
      setOrders(ordersResult.orders);
      setProducts(productsResult.products);
      setCatalogCategories(productsResult.categories);
      setAvailableProducts(productsResult.availableProducts);
      setRefunds(refundsResult.refunds);
      setTickets(ticketsResult.tickets);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load staff queues.");
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function updateOrder(
    orderNumber: string,
    status: string,
    fulfillment?: { message?: string; trackingUrl?: string; carrierName?: string; awbNumber?: string }
  ) {
    setBusyKey(`order:${orderNumber}`);
    try {
      await readJson(await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, status, ...fulfillment }),
      }));
      await reload();
      setMessage(`${orderNumber} updated to ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update order.");
    } finally {
      setBusyKey("");
    }
  }

  async function updateProduct(productId: string, isPublished: boolean) {
    setBusyKey(`product:${productId}`);
    try {
      await readJson(await fetch(`/api/admin/catalog/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished }),
      }));
      await reload();
      setMessage("Catalog publication updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update catalog.");
    } finally {
      setBusyKey("");
    }
  }

  async function moveCatalogProduct(productId: string, categoryId: string) {
    setBusyKey(`product:${productId}`);
    try {
      await readJson(await fetch(`/api/admin/catalog/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      }));
      await reload();
      setMessage("E-commerce category updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update category.");
    } finally {
      setBusyKey("");
    }
  }

  async function updateCatalogOverrides(event: React.FormEvent<HTMLFormElement>, productId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const price = String(form.get("priceOverride") ?? "").trim();
    const stock = String(form.get("stockOverride") ?? "").trim();
    setBusyKey(`product:${productId}`);
    try {
      await readJson(await fetch(`/api/admin/catalog/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameOverride: String(form.get("nameOverride") ?? "").trim() || null,
          descriptionOverride: String(form.get("descriptionOverride") ?? "").trim() || null,
          priceOverride: price ? Number(price) : null,
          imageUrlOverride: String(form.get("imageUrlOverride") ?? "").trim() || null,
          stockOverride: stock !== "" ? Number(stock) : null,
        }),
      }));
      await reload();
      setMessage("Storefront-only product details updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update storefront details.");
    } finally {
      setBusyKey("");
    }
  }

  async function removeCatalogProduct(productId: string) {
    if (!window.confirm("Remove this e-commerce listing? The ERP product will not be changed.")) return;
    setBusyKey(`product:${productId}`);
    try {
      await readJson(await fetch(`/api/admin/catalog/${productId}`, { method: "DELETE" }));
      await reload();
      setMessage("E-commerce listing removed; ERP data was not changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the catalog entry.");
    } finally {
      setBusyKey("");
    }
  }

  async function addCatalogProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const productId = String(form.get("productId"));
    setBusyKey("catalog:create");
    try {
      await readJson(await fetch("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          categoryId: String(form.get("categoryId")),
        }),
      }));
      formElement.reset();
      await reload();
      setMessage("ERP product added to the e-commerce catalog as unpublished.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the catalog entry.");
    } finally {
      setBusyKey("");
    }
  }

  async function createRefund(event: React.FormEvent<HTMLFormElement>, orderNumber: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusyKey(`refund:${orderNumber}`);
    try {
      await readJson(await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/refunds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(form.get("amount")), reason: form.get("reason") }),
      }));
      formElement.reset();
      await reload();
      setMessage(`Refund request recorded for ${orderNumber}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create refund request.");
    } finally {
      setBusyKey("");
    }
  }

  async function updateRefund(event: React.FormEvent<HTMLFormElement>, refund: RefundRequest) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status"));
    setBusyKey(`refund-update:${refund.id}`);
    try {
      await readJson(await fetch(`/api/admin/orders/${encodeURIComponent(refund.order_number)}/refunds`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refundId: refund.id,
          status,
          externalReference: form.get("externalReference"),
          reviewNote: form.get("reviewNote"),
          paymentVerified: form.get("paymentVerified") === "true",
        }),
      }));
      await reload();
      setMessage(`Refund ${refund.id} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update refund.");
    } finally {
      setBusyKey("");
    }
  }

  async function replyToTicket(event: React.FormEvent<HTMLFormElement>, ticket: SupportTicket) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusyKey(`ticket:${ticket.ticket_number}`);
    try {
      await readJson(await fetch("/api/admin/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketNumber: ticket.ticket_number, status: form.get("status"), reply: form.get("reply") }),
      }));
      await reload();
      setMessage(`Reply queued for ${ticket.ticket_number}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reply to ticket.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="admin-console">
      <div className="admin-console__toolbar">
        <span role="status">{message}</span>
        <button type="button" className="support-action-btn support-action-btn--outline" onClick={() => void reload()}>Refresh queues</button>
      </div>

      <section className="admin-section" aria-labelledby="admin-orders-title">
        <h2 id="admin-orders-title">Order requests</h2>
        {orders.length === 0 ? <p>No order requests are waiting in this queue.</p> : orders.map((order) => (
          <article className="admin-row" key={order.order_number}>
            <div className="admin-row__details">
              <strong>{order.order_number} · {order.billing_address_snapshot.companyName || order.billing_address_snapshot.contactPerson}</strong>
              <span>{order.billing_address_snapshot.email} · {order.status} / {order.payment_status} · {new Intl.NumberFormat("en-IN", { style: "currency", currency: order.currency }).format(Number(order.total_amount))}</span>
              <small>Request only. No payment or stock reservation has occurred.</small>
            </div>
            <div className="admin-row__actions">
              {order.status === "PENDING" && (
                <>
                  <button disabled={busyKey === `order:${order.order_number}`} onClick={() => void updateOrder(order.order_number, "IN_REVIEW")}>Mark in review</button>
                  <button disabled={busyKey === `order:${order.order_number}`} onClick={() => void updateOrder(order.order_number, "CONFIRMED")}>Confirm order</button>
                  <button disabled={busyKey === `order:${order.order_number}`} onClick={() => void updateOrder(order.order_number, "REJECTED")}>Reject</button>
                </>
              )}
              {order.status === "IN_REVIEW" && (
                <>
                  <button disabled={busyKey === `order:${order.order_number}`} onClick={() => void updateOrder(order.order_number, "CONFIRMED")}>Confirm order</button>
                  <button disabled={busyKey === `order:${order.order_number}`} onClick={() => void updateOrder(order.order_number, "REJECTED")}>Reject</button>
                </>
              )}
              {order.status === "CONFIRMED" && (
                <button disabled={busyKey === `order:${order.order_number}`} onClick={() => void updateOrder(order.order_number, "PROCESSING")}>Start processing</button>
              )}
              {order.status === "PROCESSING" && (
                <>
                  <button disabled={busyKey === `order:${order.order_number}`} onClick={() => void updateOrder(order.order_number, "PACKAGED")}>Mark Packaged</button>
                  <details>
                    <summary>Dispatch & Add Tracking</summary>
                    <form onSubmit={(event) => {
                      event.preventDefault();
                      const fields = new FormData(event.currentTarget);
                      void updateOrder(order.order_number, "IN_TRANSIT", {
                        carrierName: String(fields.get("carrierName") || "").trim(),
                        awbNumber: String(fields.get("awbNumber") || "").trim(),
                        message: String(fields.get("message") || "").trim(),
                        trackingUrl: String(fields.get("trackingUrl") || "").trim(),
                      });
                    }}>
                      <label>Carrier Name<input name="carrierName" placeholder="e.g. Blue Dart, Delhivery" /></label>
                      <label>AWB Number<input name="awbNumber" placeholder="e.g. AWB12345678" /></label>
                      <label>Tracking URL<input name="trackingUrl" type="url" pattern="https://.*" placeholder="https://..." /></label>
                      <label>Notes<input name="message" maxLength={1000} placeholder="Notes" /></label>
                      <button disabled={busyKey === `order:${order.order_number}`}>Dispatch order</button>
                    </form>
                  </details>
                </>
              )}
              {order.status === "PACKAGED" && (
                <details open>
                  <summary>Mark In Transit</summary>
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    const fields = new FormData(event.currentTarget);
                    void updateOrder(order.order_number, "IN_TRANSIT", {
                      carrierName: String(fields.get("carrierName") || "").trim(),
                      awbNumber: String(fields.get("awbNumber") || "").trim(),
                      message: String(fields.get("message") || "").trim(),
                      trackingUrl: String(fields.get("trackingUrl") || "").trim(),
                    });
                  }}>
                    <label>Carrier Name<input name="carrierName" placeholder="e.g. Blue Dart, Delhivery" /></label>
                    <label>AWB Number<input name="awbNumber" placeholder="e.g. AWB12345678" /></label>
                    <label>Tracking URL<input name="trackingUrl" type="url" pattern="https://.*" placeholder="https://..." /></label>
                    <label>Notes<input name="message" maxLength={1000} placeholder="Notes" /></label>
                    <button disabled={busyKey === `order:${order.order_number}`}>Mark In Transit</button>
                  </form>
                </details>
              )}
              {(order.status === "IN_TRANSIT" || order.status === "SHIPPED") && (
                <button disabled={busyKey === `order:${order.order_number}`} onClick={() => void updateOrder(order.order_number, "DELIVERED", { message: `Order ${order.order_number} has been delivered.` })}>Mark delivered</button>
              )}
              {order.payment_status !== "PENDING" && (
                <details>
                  <summary>Refund request</summary>
                  <form onSubmit={(event) => void createRefund(event, order.order_number)}>
                    <label>Amount (INR)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
                    <label>Reason<input name="reason" minLength={5} maxLength={1000} required /></label>
                    <button disabled={busyKey === `refund:${order.order_number}`}>Record request</button>
                  </form>
                </details>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="admin-section" aria-labelledby="admin-catalog-title">
        <h2 id="admin-catalog-title">Catalog publication</h2>
        <form className="admin-ticket-form" onSubmit={(event) => void addCatalogProduct(event)}>
          <label>ERP product
            <select name="productId" required defaultValue="">
              <option value="" disabled>Select a product</option>
              {availableProducts.map((product) => (
                <option value={product.productId} key={product.productId}>{product.name} ({product.sku})</option>
              ))}
            </select>
          </label>
          <label>E-commerce category
            <select name="categoryId" required defaultValue="">
              <option value="" disabled>Select a category</option>
              {catalogCategories.map((category) => (
                <option value={category.id} key={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <button disabled={busyKey === "catalog:create" || !availableProducts.length || !catalogCategories.length}>
            Add unpublished product
          </button>
        </form>
        {!availableProducts.length && <p>Every product in the current ERP result is already mapped, or no active ERP products were found.</p>}
        {products.map((product) => (
          <article className="admin-row" key={product.product_id}>
            <div className="admin-row__details">
              <strong>{product.name} <small>({product.sku})</small></strong>
              <span>{product.category_name}{product.type_name ? ` / ${product.type_name}` : ""} · {product.is_published ? "Published" : "Unpublished"} · Available Stock: {product.effective_stock ?? 0} (ERP: {product.erp_stock ?? 0}{product.stock_override !== null ? `, Override: ${product.stock_override}` : ""})</span>
              <small>Product {product.product_is_active ? "active" : "inactive"}; category {product.category_is_active ? "active" : "inactive"}; type {product.type_name ? product.type_is_active ? "active" : "inactive" : "not set"}.</small>
              <label>Move to category
                <select
                  value={product.category_id}
                  disabled={busyKey === `product:${product.product_id}`}
                  onChange={(event) => void moveCatalogProduct(product.product_id, event.target.value)}
                >
                  {catalogCategories.map((category) => (
                    <option value={category.id} key={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <form className="admin-ticket-form" onSubmit={(event) => void updateCatalogOverrides(event, product.product_id)}>
                <label>Storefront name override<input name="nameOverride" maxLength={250} defaultValue={product.name_override ?? ""} placeholder={product.name} /></label>
                <label>Storefront description override<textarea name="descriptionOverride" maxLength={10000} defaultValue={product.description_override ?? ""} placeholder="Leave blank to use the ERP description." /></label>
                <label>Storefront price override (INR)<input name="priceOverride" type="number" min="0" max="100000000" step="0.01" defaultValue={product.price_override ?? ""} placeholder="Use ERP price" /></label>
                <label>Storefront stock override<input name="stockOverride" type="number" min="0" max="1000000" step="1" defaultValue={product.stock_override ?? ""} placeholder="Use ERP stock" /></label>
                <label>Storefront image URL/path override<input name="imageUrlOverride" maxLength={2048} defaultValue={product.image_url_override ?? ""} placeholder="Use ERP image" /></label>
                <button disabled={busyKey === `product:${product.product_id}`}>Save storefront details</button>
              </form>
            </div>
            <div className="admin-row__actions">
              <button
                type="button"
                disabled={busyKey === `product:${product.product_id}` || (!product.is_published && (!product.product_is_active || !product.category_is_active || product.type_is_active === false))}
                onClick={() => void updateProduct(product.product_id, !product.is_published)}
              >{product.is_published ? "Unpublish" : "Publish"}</button>
              <button
                type="button"
                disabled={busyKey === `product:${product.product_id}`}
                onClick={() => void removeCatalogProduct(product.product_id)}
              >Remove listing</button>
            </div>
          </article>
        ))}
      </section>

      <section className="admin-section" aria-labelledby="admin-refunds-title">
        <h2 id="admin-refunds-title">Refund review</h2>
        {refunds.length === 0 ? <p>No refund requests.</p> : refunds.map((refund) => (
          <article className="admin-row" key={refund.id}>
            <div className="admin-row__details">
              <strong>{refund.order_number} · INR {Number(refund.amount).toFixed(2)} · {refund.status}</strong>
              <span>{refund.reason}</span>
              {refund.external_reference && <small>Processor reference: {refund.external_reference}</small>}
            </div>
                  {!["REJECTED", "COMPLETED"].includes(refund.status) && (
              <form className="admin-refund-form" onSubmit={(event) => void updateRefund(event, refund)}>
                <select name="status" defaultValue={refund.status === "REQUESTED" ? "APPROVED" : refund.status === "APPROVED" ? "PROCESSING" : "COMPLETED"}>
                  {refund.status === "REQUESTED" && <><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></>}
                  {refund.status === "APPROVED" && <><option value="PROCESSING">Mark processing</option><option value="REJECTED">Reject</option></>}
                  {refund.status === "PROCESSING" && <option value="COMPLETED">Confirm externally processed</option>}
                </select>
                <input name="externalReference" placeholder="Provider refund reference (required to complete)" />
                <input name="reviewNote" placeholder="Review note" maxLength={1000} />
                {refund.status === "PROCESSING" && <label><input name="paymentVerified" type="checkbox" value="true" required /> I verified this refund with the payment provider</label>}
                <button disabled={busyKey === `refund-update:${refund.id}`}>Update</button>
              </form>
            )}
          </article>
        ))}
      </section>

      <section className="admin-section" aria-labelledby="admin-support-title">
        <h2 id="admin-support-title">Open support tickets</h2>
        {tickets.length === 0 ? <p>No open support tickets.</p> : tickets.map((ticket) => (
          <article className="admin-row" key={ticket.ticket_number}>
            <div className="admin-row__details">
              <strong>{ticket.ticket_number} · {ticket.subject}</strong>
              <span>{ticket.customer_name} · {ticket.customer_email} · {ticket.category}{ticket.order_number ? ` · ${ticket.order_number}` : ""}</span>
              <p>{ticket.message}</p>
            </div>
            <form className="admin-ticket-form" onSubmit={(event) => void replyToTicket(event, ticket)}>
              <select name="status" defaultValue="IN_PROGRESS">
                <option value="IN_PROGRESS">In progress</option>
                <option value="WAITING_CUSTOMER">Waiting for customer</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
              <textarea name="reply" minLength={3} maxLength={4000} required placeholder="Reply to customer; this will be queued for email delivery." />
              <button disabled={busyKey === `ticket:${ticket.ticket_number}`}>Save and queue reply</button>
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}
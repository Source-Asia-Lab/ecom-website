import assert from "node:assert/strict";
import { test } from "node:test";
import { processStaffOrderStatusTransition } from "@/app/api/admin/orders/route";

interface MockDbOptions {
  order?: {
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    billing_address_snapshot?: Record<string, unknown>;
    notes?: string | null;
  } | null;
  capturedPayment?: { id: string; status: string } | null;
  orderItems?: Array<{ product_id: string; quantity: number }>;
  activeHolds?: Array<{ id: string; product_id: string; quantity: number; expires_at: Date }>;
  existingShipment?: {
    id: string;
    carrier_name: string | null;
    awb_number: string | null;
    tracking_url: string | null;
    status: string;
    shipped_at: Date | null;
    delivered_at: Date | null;
    notes: string | null;
  } | null;
  catalog?: Array<{ product_id: string; stock_override: number | null; is_published: boolean }>;
  erpStock?: Array<{ product_id: string; stock_quantity: number }>;
  otherHolds?: Array<{ product_id: string; held_quantity: number }>;
}

function createMockDb(opts: MockDbOptions) {
  const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

  const client = {
    query: async <T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number }> => {
      executedQueries.push({ sql, params });

      // 1. Fetch order
      if (sql.includes("FROM public.ecom_orders") && sql.includes("FOR UPDATE")) {
        return { rows: opts.order ? ([opts.order] as unknown as T[]) : [] };
      }

      // 2. Fetch captured payment
      if (sql.includes("FROM public.ecom_payments") && sql.includes("status = 'CAPTURED'")) {
        return { rows: opts.capturedPayment ? ([opts.capturedPayment] as unknown as T[]) : [] };
      }

      // 3. Fetch order items
      if (sql.includes("FROM public.ecom_order_items") && sql.includes("ecom_order_id = $1")) {
        return {
          rows: (opts.orderItems !== undefined
            ? opts.orderItems
            : [{ product_id: "prod-uuid-1", quantity: 2 }]) as unknown as T[],
        };
      }

      // 4. Fetch active unexpired holds
      if (
        sql.includes("FROM public.ecom_inventory_reservations") &&
        sql.includes("status = 'HOLD'") &&
        sql.includes("expires_at > CURRENT_TIMESTAMP") &&
        sql.includes("order_id = $1")
      ) {
        return { rows: (opts.activeHolds || []) as unknown as T[] };
      }

      // 5. Fetch existing shipment
      if (sql.includes("FROM public.ecom_shipments") && sql.includes("ecom_order_id = $1")) {
        return { rows: opts.existingShipment ? ([opts.existingShipment] as unknown as T[]) : [] };
      }

      // 6. Fetch catalog
      if (sql.includes("FROM public.ecom_product_catalog") && sql.includes("product_id = ANY")) {
        return {
          rows: (opts.catalog !== undefined
            ? opts.catalog
            : [{ product_id: "prod-uuid-1", stock_override: 10, is_published: true }]) as unknown as T[],
        };
      }

      // 7. Fetch other holds
      if (
        sql.includes("FROM public.ecom_inventory_reservations") &&
        sql.includes("status = 'HOLD'") &&
        sql.includes("expires_at > CURRENT_TIMESTAMP") &&
        (sql.includes("order_id != $1") || sql.includes("order_id IS NULL"))
      ) {
        return { rows: (opts.otherHolds || []) as unknown as T[] };
      }

      // Default updates / inserts / releases
      return { rows: [], rowCount: 1 };
    },
  };

  const erpQuery = async <T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> => {
    executedQueries.push({ sql: `[ERP] ${sql}`, params });
    if (sql.includes("FROM public.inventory_bin_stock")) {
      return {
        rows: (opts.erpStock !== undefined
          ? opts.erpStock
          : [{ product_id: "prod-uuid-1", stock_quantity: 10 }]) as unknown as T[],
      };
    }
    return { rows: [] };
  };

  return { client, erpQuery, executedQueries };
}

// ============================================================================
// FIX 1: Duplicate shipment creation on PACKAGED -> IN_TRANSIT
// ============================================================================

test("PACKAGED inserts initial shipment, and IN_TRANSIT updates the existing shipment without duplicating", async () => {
  // Step 1: Transition PROCESSING -> PACKAGED (no shipment exists yet)
  const { client: client1, erpQuery: erpQuery1, executedQueries: queries1 } = createMockDb({
    order: {
      id: "order-uuid-1",
      order_number: "ECOM-2026-1001",
      status: "PROCESSING",
      payment_status: "PAID",
      billing_address_snapshot: { email: "customer@example.com", contactPerson: "Test Customer", phone: "9876543210" },
      notes: null,
    },
    existingShipment: null,
  });

  const resPackaged = await processStaffOrderStatusTransition(
    {
      orderNumber: "ECOM-2026-1001",
      status: "PACKAGED",
      staffEmail: "staff@sourceasia.in",
      message: "Ready for pickup",
      carrierName: "BlueDart Express",
      awbNumber: "BD9990001",
    },
    client1,
    erpQuery1,
  );

  assert.equal(resPackaged.success, true);
  if (resPackaged.success) {
    assert.equal(resPackaged.status, "PACKAGED");
  }

  // Verify an INSERT into ecom_shipments was performed
  const insertShipmentQuery = queries1.find((q) => q.sql.includes("INSERT INTO public.ecom_shipments"));
  assert.ok(insertShipmentQuery, "Initial shipment must be inserted upon PACKAGED");
  assert.equal(
    queries1.some((q) => q.sql.includes("UPDATE public.ecom_shipments")),
    false,
    "No UPDATE shipment should occur when shipment does not exist yet",
  );

  // Step 2: Transition PACKAGED -> IN_TRANSIT (existing shipment IS returned)
  const existingShipmentRow = {
    id: "shipment-uuid-888",
    carrier_name: "BlueDart Express",
    awb_number: "BD9990001",
    tracking_url: null,
    status: "PACKAGED",
    shipped_at: null,
    delivered_at: null,
    notes: "Ready for pickup",
  };

  const { client: client2, erpQuery: erpQuery2, executedQueries: queries2 } = createMockDb({
    order: {
      id: "order-uuid-1",
      order_number: "ECOM-2026-1001",
      status: "PACKAGED",
      payment_status: "PAID",
      billing_address_snapshot: { email: "customer@example.com", contactPerson: "Test Customer", phone: "9876543210" },
      notes: null,
    },
    existingShipment: existingShipmentRow,
  });

  const resInTransit = await processStaffOrderStatusTransition(
    {
      orderNumber: "ECOM-2026-1001",
      status: "IN_TRANSIT",
      staffEmail: "staff@sourceasia.in",
      trackingUrl: "https://track.bluedart.com/BD9990001",
      // Notice: carrierName & awbNumber omitted in this update; existing values must be preserved!
    },
    client2,
    erpQuery2,
  );

  assert.equal(resInTransit.success, true);
  if (resInTransit.success) {
    assert.equal(resInTransit.status, "IN_TRANSIT");
  }

  // Verify UPDATE was called on the existing shipment ID, and NO duplicate INSERT was executed
  const updateShipmentQuery = queries2.find((q) => q.sql.includes("UPDATE public.ecom_shipments"));
  assert.ok(updateShipmentQuery, "Existing shipment must be updated");
  assert.equal(
    queries2.some((q) => q.sql.includes("INSERT INTO public.ecom_shipments")),
    false,
    "Must NOT insert duplicate shipment row on IN_TRANSIT",
  );

  // Verify parameters to update: $1 is existing shipment id, trackingUrl is passed
  assert.equal(updateShipmentQuery.params?.[0], "shipment-uuid-888");
  assert.equal(updateShipmentQuery.params?.[3], "https://track.bluedart.com/BD9990001");
});

// ============================================================================
// FIX 3: Prevent confirmation of unpaid orders
// ============================================================================

test("Staff cannot confirm an order when payment_status is PENDING", async () => {
  const { client, erpQuery, executedQueries } = createMockDb({
    order: {
      id: "order-uuid-unpaid",
      order_number: "ECOM-2026-UNPAID",
      status: "PENDING",
      payment_status: "PENDING", // UNPAID
      billing_address_snapshot: { email: "unpaid@example.com" },
      notes: null,
    },
    capturedPayment: null,
  });

  const res = await processStaffOrderStatusTransition(
    {
      orderNumber: "ECOM-2026-UNPAID",
      status: "CONFIRMED",
      staffEmail: "staff@sourceasia.in",
    },
    client,
    erpQuery,
  );

  assert.equal(res.success, false);
  if (!res.success) {
    assert.equal(res.statusCode, 422);
    assert.match(res.error, /Cannot confirm an unpaid order\. Payment status must be PAID\./i);
  }

  // Ensure no inventory or order update was committed
  assert.equal(
    executedQueries.some((q) => q.sql.includes("UPDATE public.ecom_orders SET status = $2")),
    false,
    "Unpaid order status must NOT be updated",
  );
  assert.equal(
    executedQueries.some((q) => q.sql.includes("UPDATE public.ecom_inventory_reservations SET status = 'COMMITTED'")),
    false,
    "No inventory must be committed for an unpaid order",
  );
});

// ============================================================================
// FIX 2: Safely resolve PAYMENT_REVIEW
// ============================================================================

test("PAYMENT_REVIEW order cannot be confirmed if payment is not verified as CAPTURED in ecom_payments", async () => {
  // Edge case: order.payment_status says PAID, but no verified captured record exists in ecom_payments
  const { client, erpQuery, executedQueries } = createMockDb({
    order: {
      id: "order-uuid-review",
      order_number: "ECOM-2026-REV01",
      status: "PAYMENT_REVIEW",
      payment_status: "PAID",
      billing_address_snapshot: { email: "review@example.com" },
      notes: null,
    },
    capturedPayment: null, // No captured payment record!
  });

  const res = await processStaffOrderStatusTransition(
    {
      orderNumber: "ECOM-2026-REV01",
      status: "CONFIRMED",
      staffEmail: "staff@sourceasia.in",
    },
    client,
    erpQuery,
  );

  assert.equal(res.success, false);
  if (!res.success) {
    assert.equal(res.statusCode, 422);
    assert.match(res.error, /without a verified, captured payment record/i);
  }

  assert.equal(
    executedQueries.some((q) => q.sql.includes("UPDATE public.ecom_orders SET status = $2")),
    false,
  );
});

test("PAYMENT_REVIEW order with expired hold CANNOT be confirmed if stock is no longer available", async () => {
  const { client, erpQuery, executedQueries } = createMockDb({
    order: {
      id: "order-uuid-review-nostock",
      order_number: "ECOM-2026-NOSTOCK",
      status: "PAYMENT_REVIEW",
      payment_status: "PAID",
      billing_address_snapshot: { email: "nostock@example.com" },
      notes: null,
    },
    capturedPayment: { id: "pay-captured-123", status: "CAPTURED" },
    orderItems: [{ product_id: "prod-out-of-stock", quantity: 3 }],
    activeHolds: [], // 0 active holds (hold expired!)
    catalog: [{ product_id: "prod-out-of-stock", stock_override: 1, is_published: true }], // Only 1 available, needs 3
    erpStock: [{ product_id: "prod-out-of-stock", stock_quantity: 1 }],
    otherHolds: [],
  });

  const res = await processStaffOrderStatusTransition(
    {
      orderNumber: "ECOM-2026-NOSTOCK",
      status: "CONFIRMED",
      staffEmail: "staff@sourceasia.in",
    },
    client,
    erpQuery,
  );

  assert.equal(res.success, false);
  if (!res.success) {
    assert.equal(res.statusCode, 409);
    assert.match(res.error, /Insufficient stock available/i);
    assert.match(res.error, /Order remains in PAYMENT_REVIEW/i);
  }

  // Ensure expired hold was NOT committed
  assert.equal(
    executedQueries.some((q) => q.sql.includes("status = 'COMMITTED'")),
    false,
    "Must not commit reservations when stock is insufficient",
  );
});

test("PAYMENT_REVIEW order with expired hold CAN be safely confirmed if stock is available", async () => {
  const { client, erpQuery, executedQueries } = createMockDb({
    order: {
      id: "order-uuid-review-withstock",
      order_number: "ECOM-2026-STOCKOK",
      status: "PAYMENT_REVIEW",
      payment_status: "PAID",
      billing_address_snapshot: { email: "stockok@example.com" },
      notes: null,
    },
    capturedPayment: { id: "pay-captured-456", status: "CAPTURED" },
    orderItems: [{ product_id: "prod-available", quantity: 2 }],
    activeHolds: [], // 0 active holds (hold expired)
    catalog: [{ product_id: "prod-available", stock_override: 10, is_published: true }],
    erpStock: [{ product_id: "prod-available", stock_quantity: 10 }],
    otherHolds: [],
  });

  const res = await processStaffOrderStatusTransition(
    {
      orderNumber: "ECOM-2026-STOCKOK",
      status: "CONFIRMED",
      staffEmail: "staff@sourceasia.in",
    },
    client,
    erpQuery,
  );

  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.status, "CONFIRMED");
  }

  // Verifies:
  // 1. Expired holds marked RELEASED
  assert.ok(
    executedQueries.some((q) => q.sql.includes("UPDATE public.ecom_inventory_reservations") && q.sql.includes("SET status = 'RELEASED'")),
    "Expired holds must be marked RELEASED",
  );
  // 2. Fresh reservation inserted with COMMITTED
  assert.ok(
    executedQueries.some((q) => q.sql.includes("INSERT INTO public.ecom_inventory_reservations") && q.sql.includes("'COMMITTED'")),
    "New COMMITTED reservation must be inserted for confirmed order",
  );
  // 3. Stock override decremented
  assert.ok(
    executedQueries.some((q) => q.sql.includes("UPDATE public.ecom_product_catalog") && q.sql.includes("stock_override = GREATEST")),
    "Stock override must be decremented",
  );
});

// ============================================================================
// FIX 2 (Cancellation): Does not falsely mark PAYMENT_REVIEW order as REFUNDED
// ============================================================================

test("Cancellation of a payment-review order does not falsely mark it refunded", async () => {
  const { client, erpQuery, executedQueries } = createMockDb({
    order: {
      id: "order-uuid-cancel-paid",
      order_number: "ECOM-2026-CANCEL01",
      status: "PAYMENT_REVIEW",
      payment_status: "PAID",
      billing_address_snapshot: { email: "refundme@example.com", contactPerson: "Refund Customer", phone: "9123456780" },
      notes: "Customer contacted support",
    },
  });

  const res = await processStaffOrderStatusTransition(
    {
      orderNumber: "ECOM-2026-CANCEL01",
      status: "CANCELLED",
      staffEmail: "staff@sourceasia.in",
      message: "Customer requested cancellation before stock reallocation",
    },
    client,
    erpQuery,
  );

  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.status, "CANCELLED");
    assert.equal(res.paymentStatus, "PAID", "payment_status must remain PAID, not falsely changed to REFUNDED");
    assert.equal(res.requiresManualRefund, true);
  }

  // Verify order notes updated with manual reconciliation/refund requirement
  const updateOrderQuery = executedQueries.find((q) => q.sql.includes("UPDATE public.ecom_orders"));
  assert.ok(updateOrderQuery);
  assert.match(String(updateOrderQuery.params?.[2] || ""), /ACTION REQUIRED: Order cancelled after payment was captured\. Manual reconciliation\/refund required\./);

  // Verify audit log records manual refund requirement
  const auditQuery = executedQueries.find((q) => q.sql.includes("INSERT INTO public.ecom_audit_log"));
  assert.ok(auditQuery);
  const auditAfter = JSON.parse(String(auditQuery.params?.[3] || "{}"));
  assert.equal(auditAfter.requiresManualRefund, true);

  // Verify notification outbox records cancellation event
  const outboxQuery = executedQueries.find((q) => q.sql.includes("INSERT INTO public.ecom_notification_outbox"));
  assert.ok(outboxQuery);
  assert.equal(outboxQuery.params?.[1], "CANCELLATION");
});

// ============================================================================
// Fulfillment Lifecycle & Preserved Notifications / Audit Logging
// ============================================================================

test("Full valid paid order progression: CONFIRMED -> PROCESSING -> PACKAGED -> IN_TRANSIT -> DELIVERED", async () => {
  // Transition 1: CONFIRMED -> PROCESSING
  const db1 = createMockDb({
    order: {
      id: "order-uuid-flow",
      order_number: "ECOM-2026-FLOW",
      status: "CONFIRMED",
      payment_status: "PAID",
      billing_address_snapshot: { email: "flow@example.com" },
    },
  });
  const res1 = await processStaffOrderStatusTransition(
    { orderNumber: "ECOM-2026-FLOW", status: "PROCESSING", staffEmail: "staff@sourceasia.in" },
    db1.client,
    db1.erpQuery,
  );
  assert.equal(res1.success, true);
  if (res1.success) assert.equal(res1.status, "PROCESSING");

  // Transition 2: PROCESSING -> PACKAGED
  const db2 = createMockDb({
    order: {
      id: "order-uuid-flow",
      order_number: "ECOM-2026-FLOW",
      status: "PROCESSING",
      payment_status: "PAID",
      billing_address_snapshot: { email: "flow@example.com" },
    },
    existingShipment: null,
  });
  const res2 = await processStaffOrderStatusTransition(
    { orderNumber: "ECOM-2026-FLOW", status: "PACKAGED", staffEmail: "staff@sourceasia.in", carrierName: "FedEx", awbNumber: "FX-100" },
    db2.client,
    db2.erpQuery,
  );
  assert.equal(res2.success, true);
  if (res2.success) assert.equal(res2.status, "PACKAGED");

  // Transition 3: PACKAGED -> IN_TRANSIT
  const db3 = createMockDb({
    order: {
      id: "order-uuid-flow",
      order_number: "ECOM-2026-FLOW",
      status: "PACKAGED",
      payment_status: "PAID",
      billing_address_snapshot: { email: "flow@example.com" },
    },
    existingShipment: {
      id: "shipment-flow-1",
      carrier_name: "FedEx",
      awb_number: "FX-100",
      tracking_url: null,
      status: "PACKAGED",
      shipped_at: null,
      delivered_at: null,
      notes: null,
    },
  });
  const res3 = await processStaffOrderStatusTransition(
    {
      orderNumber: "ECOM-2026-FLOW",
      status: "IN_TRANSIT",
      staffEmail: "staff@sourceasia.in",
      trackingUrl: "https://fedex.com/track/FX-100",
    },
    db3.client,
    db3.erpQuery,
  );
  assert.equal(res3.success, true);
  if (res3.success) assert.equal(res3.status, "IN_TRANSIT");
  const dispatchNotif = db3.executedQueries.find((q) => q.sql.includes("INSERT INTO public.ecom_notification_outbox"));
  assert.ok(dispatchNotif);
  assert.equal(dispatchNotif.params?.[1], "DISPATCH");

  // Transition 4: IN_TRANSIT -> DELIVERED
  const db4 = createMockDb({
    order: {
      id: "order-uuid-flow",
      order_number: "ECOM-2026-FLOW",
      status: "IN_TRANSIT",
      payment_status: "PAID",
      billing_address_snapshot: { email: "flow@example.com" },
    },
    existingShipment: {
      id: "shipment-flow-1",
      carrier_name: "FedEx",
      awb_number: "FX-100",
      tracking_url: "https://fedex.com/track/FX-100",
      status: "IN_TRANSIT",
      shipped_at: new Date(),
      delivered_at: null,
      notes: null,
    },
  });
  const res4 = await processStaffOrderStatusTransition(
    { orderNumber: "ECOM-2026-FLOW", status: "DELIVERED", staffEmail: "staff@sourceasia.in", message: "Delivered to reception" },
    db4.client,
    db4.erpQuery,
  );
  assert.equal(res4.success, true);
  if (res4.success) assert.equal(res4.status, "DELIVERED");
  const deliveryNotif = db4.executedQueries.find((q) => q.sql.includes("INSERT INTO public.ecom_notification_outbox"));
  assert.ok(deliveryNotif);
  assert.equal(deliveryNotif.params?.[1], "DELIVERY");
});

test("Invalid transitions are strictly rejected with 409", async () => {
  const db = createMockDb({
    order: {
      id: "order-uuid-invalid",
      order_number: "ECOM-2026-INV",
      status: "PENDING",
      payment_status: "PENDING",
      billing_address_snapshot: { email: "invalid@example.com" },
    },
  });

  // PENDING cannot jump straight to DELIVERED
  const res = await processStaffOrderStatusTransition(
    { orderNumber: "ECOM-2026-INV", status: "DELIVERED", staffEmail: "staff@sourceasia.in" },
    db.client,
    db.erpQuery,
  );

  assert.equal(res.success, false);
  if (!res.success) {
    assert.equal(res.statusCode, 409);
    assert.match(res.error, /This order cannot make that transition\./i);
  }
});

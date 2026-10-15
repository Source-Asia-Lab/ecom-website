const { Client } = require('pg');

const ECOM_DB_URL = 'postgresql://sourceasia_admin:Postgres_DB@sourceasia-pgsql-db-dev.postgres.database.azure.com:5432/source_asia_ecommerce_db?sslmode=require';

async function listTestData() {
  const client = new Client({ connectionString: ECOM_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const customers = await client.query(`
    SELECT id, email, first_name, last_name, company_name, created_at 
    FROM public.ecom_customers 
    WHERE email ILIKE '%test.buyer%' OR email ILIKE '%example.com'
  `);
  const custIds = customers.rows.map(r => r.id);

  const addresses = custIds.length > 0 ? (await client.query(`
    SELECT id, ecom_customer_id, full_name, address_line_1, city, state 
    FROM public.ecom_addresses 
    WHERE ecom_customer_id = ANY($1::uuid[])
  `, [custIds])).rows : [];

  const carts = custIds.length > 0 ? (await client.query(`
    SELECT id, ecom_customer_id, status, created_at 
    FROM public.ecom_carts 
    WHERE ecom_customer_id = ANY($1::uuid[])
  `, [custIds])).rows : [];
  const cartIds = carts.map(r => r.id);

  const cartItems = cartIds.length > 0 ? (await client.query(`
    SELECT id, cart_id, product_id, quantity 
    FROM public.ecom_cart_items 
    WHERE cart_id = ANY($1::uuid[])
  `, [cartIds])).rows : [];

  const orders = await client.query(`
    SELECT id, order_number, ecom_customer_id, status, payment_status, total_amount, created_at 
    FROM public.ecom_orders 
    WHERE order_number ILIKE 'ECOM-2026-%'
  `);
  const orderIds = orders.rows.map(r => r.id);

  const orderItems = orderIds.length > 0 ? (await client.query(`
    SELECT id, ecom_order_id, product_name_snapshot, sku_snapshot, quantity, line_total 
    FROM public.ecom_order_items 
    WHERE ecom_order_id = ANY($1::uuid[])
  `, [orderIds])).rows : [];

  const reservations = orderIds.length > 0 ? (await client.query(`
    SELECT id, order_id, product_id, quantity, status, expires_at 
    FROM public.ecom_inventory_reservations 
    WHERE order_id = ANY($1::uuid[])
  `, [orderIds])).rows : [];

  const payments = orderIds.length > 0 ? (await client.query(`
    SELECT id, ecom_order_id, razorpay_order_id, razorpay_payment_id, amount, status, method 
    FROM public.ecom_payments 
    WHERE ecom_order_id = ANY($1::uuid[])
  `, [orderIds])).rows : [];

  const shipments = orderIds.length > 0 ? (await client.query(`
    SELECT id, ecom_order_id, carrier_name, awb_number, tracking_url, status, shipped_at, delivered_at, notes 
    FROM public.ecom_shipments 
    WHERE ecom_order_id = ANY($1::uuid[])
  `, [orderIds])).rows : [];

  const outbox = orderIds.length > 0 ? (await client.query(`
    SELECT id, order_id, event_key, event_type, email, status, created_at 
    FROM public.ecom_notification_outbox 
    WHERE order_id = ANY($1::uuid[])
  `, [orderIds])).rows : [];

  const audits = await client.query(`
    SELECT id, actor_email, action, entity_type, entity_id, created_at 
    FROM public.ecom_audit_log 
    WHERE entity_type IN ('ORDER', 'ORDER_REQUEST') 
       OR actor_email = 'system:payment_verifier'
    ORDER BY created_at DESC
  `);

  console.log(JSON.stringify({
    customers: customers.rows,
    addresses,
    carts,
    cartItems,
    orders: orders.rows,
    orderItems,
    reservations,
    payments,
    shipments,
    outbox,
    audits: audits.rows
  }, null, 2));

  await client.end();
}

listTestData().catch(console.error);

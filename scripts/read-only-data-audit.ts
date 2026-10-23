/**
 * READ-ONLY backend data audit.
 * Runs SELECT queries only against the ERP database (DATABASE_URL) and the
 * e-commerce database (ECOMMERCE_DATABASE_URL). No INSERT/UPDATE/DELETE/DDL.
 * Credentials are read from env files and are never printed.
 */
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

function loadEnvFiles(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const file of [".env.local", ".env.development.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
  return env;
}

function describe(value: string | undefined, label: string): string {
  if (!value?.trim()) return `${label}: (not configured)`;
  try {
    const url = new URL(value.trim());
    return `${label}: host=${url.hostname} db=${decodeURIComponent(url.pathname.replace(/^\//, ""))}`;
  } catch {
    return `${label}: (malformed URL, not printed)`;
  }
}

async function auditClient(label: string, url: string, queries: Array<[string, string]>): Promise<boolean> {
  if (!url?.trim()) {
    console.log(`\n=== ${label}: SKIPPED (not configured) ===`);
    return false;
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log(`\n=== ${label} ===`);
    const identity = await client.query<{ db: string; user: string; server: string }>(
      "SELECT current_database() AS db, current_user AS user, inet_server_addr()::text AS server",
    );
    console.log(`connected as ${identity.rows[0].user} to ${identity.rows[0].db}`);
    for (const [title, sql] of queries) {
      try {
        const res = await client.query(sql);
        console.log(`\n-- ${title}`);
        console.log(JSON.stringify(res.rows, (_, v) => (typeof v === "bigint" ? String(v) : v), 2));
      } catch (err) {
        console.log(`\n-- ${title}\nERROR: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
    return true;
  } catch (err) {
    console.log(`\n=== ${label}: CONNECT FAILED ===`);
    console.log(err instanceof Error ? err.message.split("\n")[0] : String(err));
    return false;
  } finally {
    try { await client.end(); } catch { /* already closed */ }
  }
}

const env = loadEnvFiles();
process.env.DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL || "";
process.env.ECOMMERCE_DATABASE_URL = process.env.ECOMMERCE_DATABASE_URL || env.ECOMMERCE_DATABASE_URL || "";

console.log(describe(process.env.DATABASE_URL, "DATABASE_URL (ERP)"));
console.log(describe(process.env.ECOMMERCE_DATABASE_URL, "ECOMMERCE_DATABASE_URL (e-commerce)"));

const erpQueries: Array<[string, string]> = [
  ["row counts of key tables", `SELECT 'products' AS table_name, count(*)::bigint AS rows FROM public.products
     UNION ALL SELECT 'customers', count(*)::bigint FROM public.customers
     UNION ALL SELECT 'sales_orders', count(*)::bigint FROM public.sales_orders
     UNION ALL SELECT 'inventory_bin_stock', count(*)::bigint FROM public.inventory_bin_stock
     ORDER BY table_name`],
  ["sample products (real data check)", `SELECT id, name, sku, sale_price, is_active FROM public.products ORDER BY created_at DESC LIMIT 5`],
  ["distinct product count / duplicated SKUs", `SELECT count(DISTINCT sku) AS distinct_skus, count(*) AS total FROM public.products`],
  ["sample customers", `SELECT id, email, company_name, created_at FROM public.customers ORDER BY created_at DESC LIMIT 5`],
  ["schema list", `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`],
];

const ecomQueries: Array<[string, string]> = [
  ["row counts of ecom tables", `SELECT 'ecom_orders' AS table_name, count(*)::bigint AS rows FROM public.ecom_orders
     UNION ALL SELECT 'ecom_customers', count(*)::bigint FROM public.ecom_customers
     UNION ALL SELECT 'ecom_payments', count(*)::bigint FROM public.ecom_payments
     UNION ALL SELECT 'ecom_shipments', count(*)::bigint FROM public.ecom_shipments
     UNION ALL SELECT 'ecom_product_catalog', count(*)::bigint FROM public.ecom_product_catalog
     UNION ALL SELECT 'ecom_categories', count(*)::bigint FROM public.ecom_categories
     ORDER BY table_name`],
  ["sample orders", `SELECT id, order_number, status, payment_status, total_amount, currency, created_at FROM public.ecom_orders ORDER BY created_at DESC LIMIT 5`],
  ["sample customers", `SELECT id, email, first_name, last_name, created_at FROM public.ecom_customers ORDER BY created_at DESC LIMIT 5`],
  ["sample catalog rows (linked to ERP products?)", `SELECT product_id, is_published, stock_override, price_override, name_override FROM public.ecom_product_catalog ORDER BY created_at DESC LIMIT 5`],
  ["payment records", `SELECT id, ecom_order_id, gateway, amount, currency, status, method, created_at FROM public.ecom_payments ORDER BY created_at DESC LIMIT 5`],
  ["shipment records", `SELECT id, ecom_order_id, carrier_name, awb_number, status, shipped_at, delivered_at FROM public.ecom_shipments ORDER BY created_at DESC LIMIT 5`],
  ["schema list", `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`],
];

async function main() {
  const erpOk = await auditClient("ERP (DATABASE_URL)", process.env.DATABASE_URL ?? "", erpQueries);
  const ecomOk = await auditClient("E-COMMERCE (ECOMMERCE_DATABASE_URL)", process.env.ECOMMERCE_DATABASE_URL ?? "", ecomQueries);

  console.log("\n=== SUMMARY ===");
  console.log(`ERP audited (read-only): ${erpOk}`);
  console.log(`E-commerce audited (read-only): ${ecomOk}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

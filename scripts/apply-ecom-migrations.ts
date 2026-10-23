/**
 * Applies pending e-commerce migrations (007, 008) to the e-commerce database.
 * Additive-only and idempotent: creates the idempotency table and adds the
 * bank-transfer columns. Never touches ERP data or existing rows.
 * Run with: npx tsx --env-file=.env.local scripts/apply-ecom-migrations.ts
 */
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const file of [".env.local", ".env.development.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const url = process.env.ECOMMERCE_DATABASE_URL || env.ECOMMERCE_DATABASE_URL;
if (!url) {
  console.error("ECOMMERCE_DATABASE_URL is not set; refusing to run.");
  process.exit(1);
}
const parsed = new URL(url);
console.log(`Target: host=${parsed.hostname} db=${decodeURIComponent(parsed.pathname.replace(/^\//, ""))} (e-commerce database only)`);

const MIGRATIONS = ["007_add_order_idempotency.sql", "008_add_bank_transfer_payments.sql"];
const migrationsDir = path.resolve(process.cwd(), "db/migrations");

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
await client.connect();
try {
  for (const file of MIGRATIONS) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      await client.query(sql);
      console.log(`applied: ${file}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Idempotent migrations should not fail; surface real errors.
      console.error(`FAILED: ${file}: ${message.split("\n")[0]}`);
      process.exitCode = 1;
    }
  }
  // Verify
  const check = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('ecom_order_idempotency','ecom_payments')`,
  );
  console.log(`verified tables: ${check.rows.map((r) => r.table_name).sort().join(", ")}`);
  const col = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ecom_payments' AND column_name='utr_reference'`,
  );
  console.log(`ecom_payments.utr_reference present: ${col.rows[0].count === "1"}`);
} finally {
  await client.end();
}
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

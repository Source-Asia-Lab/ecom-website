import { Pool, type Client, type PoolClient } from "pg";
import type { TLSSocket } from "node:tls";
import fs from "node:fs";
import path from "node:path";

const TEST_DATABASE = "sourceasia_ecom_test";
const TEST_ROLE = "sourceasia_ecom_test";
const TEST_DATABASE_MARKER = "Source Asia integration tests only";
const PROTECTED_DATABASES = new Set([
  "source_asia_db", "source_asia_ecommerce_db", "sourceasia_ecommerce",
  "sourceasiadb", "ecommerce", "production", "staging",
]);

function parseDatabaseUrl(value: string | undefined, variable: string): URL {
  if (!value?.trim()) throw new Error(`${variable} is required; no database URL fallback is allowed.`);
  try {
    const url = new URL(value.trim());
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.hash) throw new Error();
    // pg URL parameters can override host/database/SSL; never pass them through.
    for (const key of url.searchParams.keys()) if (key !== "sslmode") throw new Error();
    if (!decodeURIComponent(url.pathname.replace(/^\//, ""))) throw new Error();
    return url;
  } catch {
    throw new Error(`${variable} must be a valid PostgreSQL URL without connection overrides.`);
  }
}

function databaseName(url: URL): string {
  try { return decodeURIComponent(url.pathname.replace(/^\//, "")); }
  catch { throw new Error("Database identity could not be decoded; connection refused."); }
}

function sameServer(a: URL, b: URL): boolean {
  return a.hostname.toLowerCase() === b.hostname.toLowerCase() && (a.port || "5432") === (b.port || "5432");
}

/** Require the provisioned test database and TLS. No application URL fallback. */
export function getValidatedTestDatabaseUrl(): string {
  const value = process.env.ECOMMERCE_TEST_DATABASE_URL;
  const test = parseDatabaseUrl(value, "ECOMMERCE_TEST_DATABASE_URL");
  const name = databaseName(test);
  if (PROTECTED_DATABASES.has(name.toLowerCase()) || name !== TEST_DATABASE) {
    throw new Error("Test database target is protected or is not the approved dedicated test database.");
  }
  if (test.searchParams.getAll("sslmode").length !== 1 || test.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("The test database requires sslmode=verify-full.");
  }
  try {
    if (decodeURIComponent(test.username) !== TEST_ROLE || !decodeURIComponent(test.password)) throw new Error();
  } catch {
    throw new Error("The test database requires its dedicated test login and credential.");
  }
  // Missing or malformed comparison settings are fatal, rather than ignored.
  const ecommerce = parseDatabaseUrl(process.env.ECOMMERCE_DATABASE_URL, "ECOMMERCE_DATABASE_URL");
  const erp = parseDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL");
  if (!sameServer(test, ecommerce) || !sameServer(test, erp)) {
    throw new Error("The test database must use the approved application server.");
  }
  if ([erp, ecommerce].some(url => databaseName(url).toLowerCase() === name.toLowerCase())) {
    throw new Error("The test database must be separate from all application database targets.");
  }
  return value!.trim();
}

export interface TestDatabasePreflight {
  server: { hostname: string; address: string; port: number };
  database: string;
  ssl: boolean;
  success: boolean;
}

/** Metadata SELECT only. Verify the actual client, including supplied pools. */
export async function verifyTestDatabaseClient(client: Client): Promise<TestDatabasePreflight> {
  const expected = new URL(getValidatedTestDatabaseUrl());
  try {
    const tls = client.connection.stream as TLSSocket;
    if (client.host.toLowerCase() !== expected.hostname.toLowerCase() || client.port !== Number(expected.port || 5432)
      || !tls.encrypted || tls.authorized !== true) throw new Error();
    const result = await client.query<{
      database: string; session_role: string; active_role: string; ssl: boolean;
      address: string; port: number; marker: string; privileged: boolean;
      memberships: number; can_connect: boolean; schema_usage: boolean; schema_create: boolean;
    }>(`SELECT pg_catalog.current_database() AS database,
        session_user AS session_role, current_user AS active_role,
        s.ssl, pg_catalog.inet_server_addr()::text AS address,
        pg_catalog.inet_server_port() AS port,
        pg_catalog.shobj_description(d.oid, 'pg_database') AS marker,
        (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls) AS privileged,
        (SELECT count(*)::int FROM pg_catalog.pg_auth_members WHERE member=r.oid) AS memberships,
        pg_catalog.has_database_privilege(current_user, d.oid, 'CONNECT') AS can_connect,
        pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
        pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create
      FROM pg_catalog.pg_database d
      JOIN pg_catalog.pg_roles r ON r.rolname=session_user
      JOIN pg_catalog.pg_stat_ssl s ON s.pid=pg_catalog.pg_backend_pid()
      WHERE d.datname=pg_catalog.current_database()`);
    const row = result.rows[0];
    if (result.rows.length !== 1 || !row || row.database !== TEST_DATABASE || PROTECTED_DATABASES.has(row.database.toLowerCase())
      || row.session_role !== TEST_ROLE || row.active_role !== TEST_ROLE || row.ssl !== true
      || row.marker !== TEST_DATABASE_MARKER || row.privileged !== false || row.memberships !== 0
      || !row.can_connect || !row.schema_usage || !row.schema_create || !row.address || !row.port) throw new Error();
    return { server: { hostname: expected.hostname, address: row.address, port: row.port }, database: row.database, ssl: true, success: true };
  } catch {
    throw new Error("Test database identity, TLS, or isolation could not be verified; access refused.");
  }
}

type ConnectCallback = (error: Error | undefined, client: PoolClient | undefined, done: (release?: Error | boolean) => void) => void;

/** Every checkout is checked, covering pool.query(), callbacks, and direct client writes. */
class VerifiedTestPool extends Pool {
  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    const checked = (async () => {
      let client: PoolClient | undefined;
      try {
        client = await super.connect();
        await verifyTestDatabaseClient(client);
        return client;
      } catch {
        client?.release(true);
        throw new Error("Test database connection failed verification; access refused.");
      }
    })();
    if (!callback) return checked;
    void checked.then(
      client => callback(undefined, client, client.release),
      () => callback(new Error("Test database connection failed verification; access refused."), undefined, () => {}),
    );
  }
}

let testPoolInstance: Pool | null = null;

export function getTestEcommerceDbPool(): Pool {
  const url = new URL(getValidatedTestDatabaseUrl());
  if (!testPoolInstance) {
    // Explicit fields prevent pg connection-string options from overriding target/TLS.
    testPoolInstance = new VerifiedTestPool({
      host: url.hostname, port: Number(url.port || 5432), database: TEST_DATABASE,
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      ssl: { rejectUnauthorized: true }, enableChannelBinding: true,
      application_name: "sourceasia-integration-tests",
      statement_timeout: 15000, lock_timeout: 10000,
      max: 10, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000,
    });
    // pg removes failed idle clients; never log raw errors or connection objects.
    testPoolInstance.on("error", () => {});
  }
  return testPoolInstance;
}

export async function closeTestEcommerceDbPool(): Promise<void> {
  if (testPoolInstance) {
    await testPoolInstance.end();
    testPoolInstance = null;
  }
}

/** SELECT-only preflight: never invokes migrations or resets. */
export async function preflightTestDatabase(): Promise<TestDatabasePreflight> {
  const client = await getTestEcommerceDbPool().connect();
  try { return await verifyTestDatabaseClient(client); }
  finally { client.release(); }
}

export async function applyMigrationsToTestDatabase(pool: Pool): Promise<string[]> {
  getValidatedTestDatabaseUrl();
  const migrationsDir = path.resolve(process.cwd(), "db/migrations");
  const files = [
    "001_create_ecom_tables.sql", "002_create_ecom_catalog.sql",
    "003_seed_approved_ecom_product_mappings.sql", "004_support_notifications_audit.sql",
    "005_add_ecommerce_product_overrides.sql",   "006_ecommerce_complete_schema.sql", "007_add_order_idempotency.sql",
      "008_add_bank_transfer_payments.sql",
    ];
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    await verifyTestDatabaseClient(client);
    for (const file of files) {
      await client.query(prepareTestMigration(file, fs.readFileSync(path.join(migrationsDir, file), "utf8")));
      applied.push(file);
    }
  } finally { client.release(); }
  return applied;
}

/** Preserve migration 003's SQL structure while replacing ERP IDs with synthetic UUIDs. */
export function prepareTestMigration(file: string, sql: string): string {
  if (file !== "003_seed_approved_ecom_product_mappings.sql") return sql;
  let products = 0;
  const synthetic = sql.replace(/'[0-9a-f-]{36}'::uuid/gi, () => {
    products++;
    return `'70000000-0000-4000-8000-${String(products).padStart(12, "0")}'::uuid`;
  });
  if (products !== 7) throw new Error("Migration 003 changed; synthetic seed substitution requires review.");
  return synthetic.replace(/^[ \t]*--[^\r\n]*(?:\r?\n|$)/gm, "");
}

export async function resetTestDatabaseTables(pool: Pool): Promise<void> {
  getValidatedTestDatabaseUrl();
  const client = await pool.connect();
  try {
    await verifyTestDatabaseClient(client);
    await client.query(`TRUNCATE TABLE
      public.ecom_order_idempotency, public.ecom_notification_outbox,
      public.ecom_audit_log, public.ecom_payment_webhooks, public.ecom_payments,
      public.ecom_shipments, public.ecom_inventory_reservations, public.ecom_cart_items,
      public.ecom_carts, public.ecom_order_items, public.ecom_orders,
      public.ecom_addresses, public.ecom_customers CASCADE;`);
  } finally { client.release(); }
}

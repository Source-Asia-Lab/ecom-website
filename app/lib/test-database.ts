import { Pool } from "pg";
import fs from "fs";
import path from "path";

/**
 * Validates that ECOMMERCE_TEST_DATABASE_URL is set, valid, and strictly separate
 * from both the ERP database (DATABASE_URL) and development e-commerce database (ECOMMERCE_DATABASE_URL).
 * Never prints credentials or database passwords.
 */
export function getValidatedTestDatabaseUrl(): string {
  const testUrlString = process.env.ECOMMERCE_TEST_DATABASE_URL?.trim();

  if (!testUrlString) {
    throw new Error(
      "ECOMMERCE_TEST_DATABASE_URL environment variable is missing. " +
      "A dedicated disposable PostgreSQL test database URL is required for integration tests. " +
      "Example: ECOMMERCE_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sourceasia_ecom_test?sslmode=disable",
    );
  }

  let testUrl: URL;
  try {
    testUrl = new URL(testUrlString);
  } catch {
    throw new Error("ECOMMERCE_TEST_DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  if (testUrl.protocol !== "postgres:" && testUrl.protocol !== "postgresql:") {
    throw new Error("ECOMMERCE_TEST_DATABASE_URL must use the postgres or postgresql protocol");
  }

  const normalizePort = (url: URL) => url.port || "5432";
  const normalizeDbName = (url: URL) => decodeURIComponent(url.pathname.replace(/^\/+/, "")).toLowerCase();

  const testDbName = normalizeDbName(testUrl);

  // Safety guard: Explicitly reject known protected production, staging, development, and ERP databases
  const protectedDatabases = [
    "source_asia_db",
    "source_asia_ecommerce_db",
    "sourceasia_ecommerce",
    "sourceasiadb",
    "ecommerce",
    "production",
    "staging",
  ];
  if (protectedDatabases.includes(testDbName)) {
    throw new Error(
      `Safety guard: '${testDbName}' is a protected database. ECOMMERCE_TEST_DATABASE_URL must target a dedicated disposable test database.`,
    );
  }

  // Safety guard: Database name must indicate a test/disposable database
  if (!testDbName.includes("test") && !testDbName.includes("disposable")) {
    throw new Error(
      `Safety guard: The test database name must contain 'test' or 'disposable' (e.g. 'sourceasia_ecom_test'). Found database: '${testDbName}'`,
    );
  }

  // Safety guard: Must NOT match ERP database URL
  const erpConnectionString = process.env.DATABASE_URL;
  if (erpConnectionString) {
    try {
      const erpUrl = new URL(erpConnectionString);
      if (
        testUrl.hostname.toLowerCase() === erpUrl.hostname.toLowerCase() &&
        normalizePort(testUrl) === normalizePort(erpUrl) &&
        testDbName === normalizeDbName(erpUrl)
      ) {
        throw new Error(
          "FATAL: ECOMMERCE_TEST_DATABASE_URL points to the ERP database (DATABASE_URL). Aborting to prevent data corruption.",
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("FATAL")) throw e;
    }
  }

  // Safety guard: Must NOT match Development E-commerce database URL
  const devEcomConnectionString = process.env.ECOMMERCE_DATABASE_URL;
  if (devEcomConnectionString) {
    try {
      const devEcomUrl = new URL(devEcomConnectionString);
      if (
        testUrl.hostname.toLowerCase() === devEcomUrl.hostname.toLowerCase() &&
        normalizePort(testUrl) === normalizePort(devEcomUrl) &&
        testDbName === normalizeDbName(devEcomUrl)
      ) {
        throw new Error(
          "FATAL: ECOMMERCE_TEST_DATABASE_URL points to the development e-commerce database (ECOMMERCE_DATABASE_URL). Aborting to prevent test data pollution.",
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("FATAL")) throw e;
    }
  }

  return testUrlString;
}

let testPoolInstance: Pool | null = null;

export function getTestEcommerceDbPool(): Pool {
  if (!testPoolInstance) {
    const connectionString = getValidatedTestDatabaseUrl();
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(connectionString).hostname);

    testPoolInstance = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: true },
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return testPoolInstance;
}

export async function closeTestEcommerceDbPool(): Promise<void> {
  if (testPoolInstance) {
    await testPoolInstance.end();
    testPoolInstance = null;
  }
}

/**
 * Applies all e-commerce migrations in sequence to the dedicated test database only.
 */
export async function applyMigrationsToTestDatabase(pool: Pool): Promise<string[]> {
  // Validate safety before running migrations
  getValidatedTestDatabaseUrl();

  const migrationsDir = path.resolve(process.cwd(), "db/migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  const client = await pool.connect();
  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");
      await client.query(sql);
      applied.push(file);
    }
  } finally {
    client.release();
  }

  return applied;
}

/**
 * Safely cleans tables in the validated disposable test database only.
 */
export async function resetTestDatabaseTables(pool: Pool): Promise<void> {
  // Validate safety
  getValidatedTestDatabaseUrl();

  const client = await pool.connect();
  try {
    await client.query(`
      TRUNCATE TABLE
        public.ecom_order_idempotency,
        public.ecom_notification_outbox,
        public.ecom_audit_log,
        public.ecom_payment_webhooks,
        public.ecom_payments,
        public.ecom_shipments,
        public.ecom_inventory_reservations,
        public.ecom_cart_items,
        public.ecom_carts,
        public.ecom_order_items,
        public.ecom_orders,
        public.ecom_addresses,
        public.ecom_customers
      CASCADE;
    `);
  } finally {
    client.release();
  }
}

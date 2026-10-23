import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import type { Client, Pool } from "pg";
import fs from "node:fs";
import { applyMigrationsToTestDatabase, getValidatedTestDatabaseUrl, prepareTestMigration, resetTestDatabaseTables, verifyTestDatabaseClient } from "./test-database";

test("test database safety gates reject unverified connections without writes", async t => {
  const keys = ["DATABASE_URL", "ECOMMERCE_DATABASE_URL", "ECOMMERCE_TEST_DATABASE_URL"] as const;
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const credential = randomBytes(24).toString("hex");
  const makeUrl = (database: string) => {
    const url = new URL("postgresql://unit.invalid");
    url.username = "sourceasia_ecom_test";
    url.password = credential;
    url.pathname = database;
    url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  };
  const configure = () => {
    process.env.DATABASE_URL = makeUrl("source_asia_db");
    process.env.ECOMMERCE_DATABASE_URL = makeUrl("source_asia_ecommerce_db");
    process.env.ECOMMERCE_TEST_DATABASE_URL = makeUrl("sourceasia_ecom_test");
  };
  try {
    await t.test("test migration 003 contains only synthetic product identifiers", () => {
      const sql = fs.readFileSync("db/migrations/003_seed_approved_ecom_product_mappings.sql", "utf8");
      const synthetic = prepareTestMigration("003_seed_approved_ecom_product_mappings.sql", sql);
      for (const id of sql.match(/'[0-9a-f-]{36}'::uuid/gi) || []) assert.equal(synthetic.includes(id), false);
      assert.equal((synthetic.match(/'70000000-0000-4000-8000-\d{12}'::uuid/g) || []).length, 7);
      assert.throws(() => prepareTestMigration("003_seed_approved_ecom_product_mappings.sql", "SELECT 1"), /requires review/);
    });
    await t.test("missing test URL never falls back to application settings", () => {
      configure(); delete process.env.ECOMMERCE_TEST_DATABASE_URL;
      assert.throws(getValidatedTestDatabaseUrl, /ECOMMERCE_TEST_DATABASE_URL is required/);
    });
    await t.test("all three protected databases are rejected", () => {
      for (const database of ["source_asia_db", "source_asia_ecommerce_db", "sourceasia_ecommerce"]) {
        configure(); process.env.ECOMMERCE_TEST_DATABASE_URL = makeUrl(database);
        assert.throws(getValidatedTestDatabaseUrl, /protected/);
      }
    });
    await t.test("host/database overrides, insecure TLS and unknown servers are rejected", () => {
      for (const update of [
        (u: URL) => u.searchParams.set("host", "other.invalid"),
        (u: URL) => u.searchParams.set("database", "source_asia_db"),
        (u: URL) => u.searchParams.set("sslmode", "disable"),
        (u: URL) => { u.hostname = "other.invalid"; },
      ]) {
        configure(); const url = new URL(process.env.ECOMMERCE_TEST_DATABASE_URL!); update(url);
        process.env.ECOMMERCE_TEST_DATABASE_URL = url.toString();
        assert.throws(getValidatedTestDatabaseUrl);
      }
    });
    await t.test("malformed application comparison URL fails closed", () => {
      configure(); process.env.DATABASE_URL = "invalid";
      assert.throws(getValidatedTestDatabaseUrl, /DATABASE_URL must be/);
    });
    const row = {
      database: "sourceasia_ecom_test", session_role: "sourceasia_ecom_test", active_role: "sourceasia_ecom_test",
      ssl: true, address: "192.0.2.1", port: 5432, marker: "Source Asia integration tests only",
      privileged: false, memberships: 0, can_connect: true, schema_usage: true, schema_create: true,
    };
    function fakeClient(overrides: Record<string, unknown> = {}) {
      let writes = 0;
      let released = false;
      const client = {
        host: "unit.invalid", port: 5432,
        connection: { stream: { encrypted: true, authorized: true } },
        query: async (sql: string) => {
          if (!sql.trim().startsWith("SELECT")) writes++;
          return { rows: [{ ...row, ...overrides }] };
        },
        release: () => { released = true; },
      };
      return { client: client as unknown as Client, writes: () => writes, released: () => released };
    }
    await t.test("valid identity verification issues metadata SELECT only", async () => {
      configure(); const fake = fakeClient();
      assert.equal((await verifyTestDatabaseClient(fake.client)).success, true);
      assert.equal(fake.writes(), 0);
    });
    await t.test("wrong live database, role, TLS, marker and admin privileges are rejected", async () => {
      for (const override of [
        { database: "source_asia_db" }, { database: "source_asia_ecommerce_db" }, { database: "sourceasia_ecommerce" },
        { session_role: "different_role" }, { ssl: false }, { marker: null }, { privileged: true }, { memberships: 1 },
      ]) {
        configure(); const fake = fakeClient(override);
        await assert.rejects(verifyTestDatabaseClient(fake.client), /could not be verified/);
        assert.equal(fake.writes(), 0);
      }
    });
    await t.test("migration and reset reject supplied application clients before any write", async () => {
      for (const operation of [applyMigrationsToTestDatabase, resetTestDatabaseTables]) {
        configure(); const fake = fakeClient({ database: "source_asia_db" });
        const pool = { connect: async () => fake.client } as unknown as Pool;
        await assert.rejects(operation(pool), /could not be verified/);
        assert.equal(fake.writes(), 0);
        assert.equal(fake.released(), true);
      }
    });
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

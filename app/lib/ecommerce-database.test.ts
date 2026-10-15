import assert from "node:assert/strict";
import { test } from "node:test";
import { getEcommerceDbPool } from "./db";

test("rejects an e-commerce URL that points to the ERP database", () => {
  const originalErpUrl = process.env.DATABASE_URL;
  const originalEcommerceUrl = process.env.ECOMMERCE_DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://erp_reader:secret@localhost:5432/sourceasia";
  process.env.ECOMMERCE_DATABASE_URL = "postgresql://ecom_app:other-secret@localhost/sourceasia?sslmode=disable";

  try {
    assert.throws(
      () => getEcommerceDbPool(),
      /ECOMMERCE_DATABASE_URL must point to a different PostgreSQL database/,
    );
  } finally {
    if (originalErpUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalErpUrl;
    if (originalEcommerceUrl === undefined) delete process.env.ECOMMERCE_DATABASE_URL;
    else process.env.ECOMMERCE_DATABASE_URL = originalEcommerceUrl;
  }
});

test("requires a dedicated e-commerce database URL", () => {
  const originalErpUrl = process.env.DATABASE_URL;
  const originalEcommerceUrl = process.env.ECOMMERCE_DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://erp_reader:secret@localhost:5432/erp";
  delete process.env.ECOMMERCE_DATABASE_URL;

  try {
    assert.throws(() => getEcommerceDbPool(), /ECOMMERCE_DATABASE_URL is required/);
  } finally {
    if (originalErpUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalErpUrl;
    if (originalEcommerceUrl === undefined) delete process.env.ECOMMERCE_DATABASE_URL;
    else process.env.ECOMMERCE_DATABASE_URL = originalEcommerceUrl;
  }
});

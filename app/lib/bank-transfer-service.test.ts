import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeBankTransferChecksum,
  verifyBankTransferChecksum,
  generateTransferReference,
  getCompanyBankAccount,
  isValidUtr,
} from "./bank-transfer-service";

test("1. isValidUtr accepts exactly 12 alphanumeric characters only", () => {
  assert.equal(isValidUtr("N12345678901"), true);
  assert.equal(isValidUtr("ABCD12345678"), true);
  assert.equal(isValidUtr(" n12345678901 "), true); // trimmed
  assert.equal(isValidUtr("N123456789012"), false); // 13 chars
  assert.equal(isValidUtr("N1234567890"), false); // 11 chars
  assert.equal(isValidUtr(""), false);
  assert.equal(isValidUtr("N1234 5678901"), false); // space inside
});

test("2. checksum computation fails closed when secret is missing", () => {
  const result = computeBankTransferChecksum({ orderNumber: "ECOM-1", amountInPaise: 11800, secret: "" });
  assert.equal(result.valid, false);
  assert.match(result.error || "", /not configured/i);
});

test("3. checksum token round-trips and rejects tampering", () => {
  const secret = "test-bank-transfer-secret";
  const good = computeBankTransferChecksum({ orderNumber: "ECOM-2026-1", amountInPaise: 11800, secret });
  assert.equal(good.valid, true);

  assert.equal(verifyBankTransferChecksum({ orderNumber: "ECOM-2026-1", amountInPaise: 11800, token: good.token!, secret }).valid, true);

  // Tampered amount
  assert.equal(verifyBankTransferChecksum({ orderNumber: "ECOM-2026-1", amountInPaise: 100, token: good.token!, secret }).valid, false);
  // Tampered order
  assert.equal(verifyBankTransferChecksum({ orderNumber: "ECOM-2026-2", amountInPaise: 11800, token: good.token!, secret }).valid, false);
  // Missing token
  assert.equal(verifyBankTransferChecksum({ orderNumber: "ECOM-2026-1", amountInPaise: 11800, token: "", secret }).valid, false);
  // Wrong secret
  assert.equal(verifyBankTransferChecksum({ orderNumber: "ECOM-2026-1", amountInPaise: 11800, token: good.token!, secret: "other" }).valid, false);
});

test("4. transfer references are unique and order-scoped", () => {
  const a = generateTransferReference("ECOM-2026-0001");
  const b = generateTransferReference("ECOM-2026-0001");
  assert.notEqual(a, b);
  assert.match(a, /^BTRF-ECOM-2026-0001-[A-Z0-9]{8}$/);
  assert.match(b, /^BTRF-ECOM-2026-0001-[A-Z0-9]{8}$/);
  // Weird order numbers are sanitized
  assert.match(generateTransferReference("O<script>x"), /^BTRF-/);
});

test("5. bank account details fail closed (never invented)", () => {
  const original = {
    name: process.env.BANK_TRANSFER_ACCOUNT_NAME,
    number: process.env.BANK_TRANSFER_ACCOUNT_NUMBER,
    ifsc: process.env.BANK_TRANSFER_IFSC,
    bank: process.env.BANK_TRANSFER_BANK_NAME,
  };
  try {
    delete process.env.BANK_TRANSFER_ACCOUNT_NAME;
    delete process.env.BANK_TRANSFER_ACCOUNT_NUMBER;
    delete process.env.BANK_TRANSFER_IFSC;
    delete process.env.BANK_TRANSFER_BANK_NAME;
    assert.equal(getCompanyBankAccount(), null, "must return null when bank details are not configured");

    process.env.BANK_TRANSFER_ACCOUNT_NAME = "Source Asia Traders";
    process.env.BANK_TRANSFER_ACCOUNT_NUMBER = "12345678901234";
    process.env.BANK_TRANSFER_IFSC = "HDFC0001234";
    process.env.BANK_TRANSFER_BANK_NAME = "HDFC Bank";
    const account = getCompanyBankAccount();
    assert.ok(account);
    assert.equal(account.accountName, "Source Asia Traders");
    assert.equal(account.ifscCode, "HDFC0001234");
  } finally {
    if (original.name !== undefined) process.env.BANK_TRANSFER_ACCOUNT_NAME = original.name;
    if (original.number !== undefined) process.env.BANK_TRANSFER_ACCOUNT_NUMBER = original.number;
    if (original.ifsc !== undefined) process.env.BANK_TRANSFER_IFSC = original.ifsc;
    if (original.bank !== undefined) process.env.BANK_TRANSFER_BANK_NAME = original.bank;
  }
});

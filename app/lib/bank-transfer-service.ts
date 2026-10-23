import crypto from "crypto";

/**
 * Direct bank transfer (NEFT/RTGS/IMPS) payment support.
 *
 * Flow:
 *  1. Customer chooses "Bank Transfer" at checkout -> a transfer reference is
 *     created for the order (ecom_payments row, gateway = 'BANK_TRANSFER').
 *  2. Customer makes the transfer from their bank and submits the UTR number.
 *  3. The UTR submission is checksum-protected and stored as
 *     PENDING_VERIFICATION. Nothing is confirmed automatically.
 *  4. Authorized staff verify the UTR against the actual bank statement
 *     (ERP `bank_transactions` table, read-only) or the bank portal and
 *     confirm/reject through the staff endpoint, which reuses the shared
 *     payment confirmation transaction.
 */

export const BANK_TRANSFER_GATEWAY = "BANK_TRANSFER";
export const BANK_TRANSFER_METHOD = "BANK_TRANSFER";

export interface BankAccountDetails {
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  branch: string;
}

/**
 * Company bank account shown to the customer at checkout.
 * Values come from env; fail closed (never invent account data).
 */
export function getCompanyBankAccount(): BankAccountDetails | null {
  const accountName = process.env.BANK_TRANSFER_ACCOUNT_NAME?.trim();
  const accountNumber = process.env.BANK_TRANSFER_ACCOUNT_NUMBER?.trim();
  const ifscCode = process.env.BANK_TRANSFER_IFSC?.trim();
  const bankName = process.env.BANK_TRANSFER_BANK_NAME?.trim();
  const branch = process.env.BANK_TRANSFER_BRANCH?.trim() || "";

  if (!accountName || !accountNumber || !ifscCode || !bankName) return null;

  return { accountName, accountNumber, ifscCode, bankName, branch };
}

/** UTR: 12-character alphanumeric reference issued by Indian banks. */
export function isValidUtr(utr: string): boolean {
  return /^[A-Za-z0-9]{12}$/.test(utr.trim());
}

/**
 * Generates the per-order transfer reference stored in
 * ecom_payments.razorpay_order_id (shared reference column for both gateways).
 * Format: BTRF-<orderNumber>-<random> so staff can match statements easily.
 */
export function generateTransferReference(orderNumber: string): string {
  const cleanOrder = orderNumber.replace(/[^A-Za-z0-9-]/g, "").slice(-20) || "ORDER";
  const unique = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `BTRF-${cleanOrder}-${unique}`;
}

/**
 * Server-issued submission token: HMAC SHA-256 of (orderNumber|amountInPaise)
 * keyed with BANK_TRANSFER_WEBHOOK_SECRET. Given to the client with the bank
 * details and verified when the UTR is submitted, so the client cannot submit
 * a UTR for an order it did not initiate or alter the amount. The secret never
 * reaches the browser. Staff verification against the bank statement remains
 * the authoritative check.
 */
export function computeBankTransferChecksum(options: {
  orderNumber: string;
  amountInPaise: number;
  secret?: string;
}): { valid: boolean; token?: string; error?: string } {
  const secret = options.secret !== undefined ? options.secret : process.env.BANK_TRANSFER_WEBHOOK_SECRET;
  if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
    return { valid: false, error: "Bank transfer checksum secret is not configured. Failing closed." };
  }
  const payload = `${options.orderNumber.trim()}|${Math.round(options.amountInPaise)}`;
  const token = crypto.createHmac("sha256", secret.trim()).update(payload).digest("hex");
  return { valid: true, token };
}

export function verifyBankTransferChecksum(options: {
  orderNumber: string;
  amountInPaise: number;
  token: string;
  secret?: string;
}): { valid: boolean; error?: string } {
  const expected = computeBankTransferChecksum(options);
  if (!expected.valid) return { valid: false, error: expected.error };
  if (!options.token || options.token.trim().length !== expected.token!.length) {
    return { valid: false, error: "Bank transfer submission token is missing or malformed." };
  }
  const ok = crypto.timingSafeEqual(
    Buffer.from(expected.token!, "utf8"),
    Buffer.from(options.token.trim(), "utf8"),
  );
  return ok ? { valid: true } : { valid: false, error: "Bank transfer submission token mismatch." };
}

/** How long the customer has to make the transfer (matches the stock hold). */
export const BANK_TRANSFER_WINDOW_MINUTES = 10;

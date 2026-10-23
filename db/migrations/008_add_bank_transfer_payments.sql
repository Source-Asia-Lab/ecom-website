-- ==============================================================================
-- MIGRATION: 008_add_bank_transfer_payments.sql
-- DESCRIPTION: Support direct bank transfer (NEFT/RTGS/IMPS) payments alongside
--              Razorpay. Customers submit a UTR reference; staff verify it.
-- TARGET DATABASE: Dedicated Source Asia e-commerce PostgreSQL database
-- SAFETY: Fully idempotent; strictly does NOT modify ERP tables or data.
-- ==============================================================================

BEGIN;

-- 1. Extend ecom_payments for bank transfer records.
--    razorpay_order_id is reused as the per-order transfer reference so the
--    existing association/indexes continue to work for both gateways.
ALTER TABLE public.ecom_payments
ADD COLUMN IF NOT EXISTS utr_reference VARCHAR(50);

-- A UTR can be used for at most one payment record.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecom_payments_utr_reference ON public.ecom_payments (utr_reference)
WHERE
    utr_reference IS NOT NULL;

DO $constraint$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ecom_payments_status_check'
          AND conrelid = 'public.ecom_payments'::regclass
    ) THEN
        ALTER TABLE public.ecom_payments
            ADD CONSTRAINT ecom_payments_status_check
            CHECK (status IN ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'));

END IF;

END $constraint$;

-- 2. Allow the PENDING_VERIFICATION state for customer-submitted bank transfers.
DO $status$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ecom_payments_status_check'
          AND conrelid = 'public.ecom_payments'::regclass
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ecom_payments_status_check'
          AND conrelid = 'public.ecom_payments'::regclass
          AND pg_get_constraintdef(oid) LIKE '%PENDING_VERIFICATION%'
    ) THEN
        ALTER TABLE public.ecom_payments DROP CONSTRAINT ecom_payments_status_check;
        ALTER TABLE public.ecom_payments
            ADD CONSTRAINT ecom_payments_status_check
            CHECK (status IN ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PENDING_VERIFICATION'));
    END IF;
END
$status$;

COMMIT;
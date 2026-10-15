-- ==============================================================================
-- MIGRATION: 007_add_order_idempotency.sql
-- DESCRIPTION: Add idempotency table for safe, duplicate-free order submission
-- TARGET DATABASE: Dedicated Source Asia e-commerce PostgreSQL database
-- SAFETY: Fully idempotent; strictly does NOT modify ERP tables or data.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ecom_order_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL,
    scope VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    ecom_order_id UUID REFERENCES public.ecom_orders(id) ON DELETE CASCADE,
    response_payload JSONB,
    status_code INTEGER NOT NULL DEFAULT 201,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ecom_order_idempotency_key_scope_unique UNIQUE (idempotency_key, scope)
);

CREATE INDEX IF NOT EXISTS idx_ecom_order_idempotency_key_scope
    ON public.ecom_order_idempotency (idempotency_key, scope);

CREATE INDEX IF NOT EXISTS idx_ecom_order_idempotency_order_id
    ON public.ecom_order_idempotency (ecom_order_id);

COMMIT;

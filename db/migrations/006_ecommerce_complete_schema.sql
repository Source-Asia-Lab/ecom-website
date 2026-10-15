-- ==============================================================================
-- MIGRATION: 006_ecommerce_complete_schema.sql
-- DESCRIPTION: Add stock overrides, inventory reservations, persistent carts,
--              payments, and delivery shipment tracking tables.
-- TARGET DATABASE: Dedicated Source Asia e-commerce PostgreSQL database
-- SAFETY: Fully idempotent; strictly does NOT modify ERP tables or data.
-- ==============================================================================

BEGIN;

-- 1. ADD stock_override TO ecom_product_catalog FOR EMPLOYEE-MANAGED WEBSITE STOCK
ALTER TABLE public.ecom_product_catalog
    ADD COLUMN IF NOT EXISTS stock_override INTEGER DEFAULT NULL;

DO $constraint$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ecom_product_catalog_stock_override_nonnegative'
          AND conrelid = 'public.ecom_product_catalog'::regclass
    ) THEN
        ALTER TABLE public.ecom_product_catalog
            ADD CONSTRAINT ecom_product_catalog_stock_override_nonnegative
            CHECK (stock_override IS NULL OR stock_override >= 0);
    END IF;
END
$constraint$;

-- 2. INVENTORY RESERVATIONS TABLE (10-Minute Hold During Checkout)
CREATE TABLE IF NOT EXISTS public.ecom_inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    order_id UUID REFERENCES public.ecom_orders(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'HOLD' CHECK (status IN ('HOLD', 'COMMITTED', 'RELEASED')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_reservations_product_status
    ON public.ecom_inventory_reservations (product_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_ecom_reservations_order_id
    ON public.ecom_inventory_reservations (order_id);

-- 3. PERSISTENT SHOPPING CARTS
CREATE TABLE IF NOT EXISTS public.ecom_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecom_customer_id UUID REFERENCES public.ecom_customers(id) ON DELETE CASCADE,
    session_token VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONVERTED', 'ABANDONED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_carts_customer_id
    ON public.ecom_carts (ecom_customer_id)
    WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_ecom_carts_session_token
    ON public.ecom_carts (session_token)
    WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.ecom_cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.ecom_carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ecom_cart_items_cart_product_key UNIQUE (cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_ecom_cart_items_cart_id
    ON public.ecom_cart_items (cart_id);

-- 4. DELIVERY SHIPMENTS TRACKING
CREATE TABLE IF NOT EXISTS public.ecom_shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecom_order_id UUID NOT NULL REFERENCES public.ecom_orders(id) ON DELETE CASCADE,
    carrier_name VARCHAR(100),
    awb_number VARCHAR(100),
    tracking_url TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING' CHECK (status IN (
        'PROCESSING', 'PACKAGED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'
    )),
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_shipments_order_id
    ON public.ecom_shipments (ecom_order_id);
CREATE INDEX IF NOT EXISTS idx_ecom_shipments_awb
    ON public.ecom_shipments (awb_number);

-- 5. RAZORPAY PAYMENT RECORDS
CREATE TABLE IF NOT EXISTS public.ecom_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecom_order_id UUID NOT NULL REFERENCES public.ecom_orders(id) ON DELETE CASCADE,
    gateway VARCHAR(30) NOT NULL DEFAULT 'RAZORPAY',
    razorpay_order_id VARCHAR(100) NOT NULL UNIQUE,
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(30) NOT NULL DEFAULT 'CREATED' CHECK (status IN (
        'CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'
    )),
    method VARCHAR(50),
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_payments_order_id
    ON public.ecom_payments (ecom_order_id);
CREATE INDEX IF NOT EXISTS idx_ecom_payments_razorpay_order_id
    ON public.ecom_payments (razorpay_order_id);

-- 6. RAZORPAY WEBHOOK IDEMPOTENCY
CREATE TABLE IF NOT EXISTS public.ecom_payment_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100) NOT NULL UNIQUE,
    event_type VARCHAR(60) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_payment_webhooks_event_id
    ON public.ecom_payment_webhooks (event_id);

COMMIT;

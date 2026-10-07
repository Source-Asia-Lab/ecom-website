-- ==============================================================================
-- MIGRATION: 001_create_ecom_tables.sql
-- DESCRIPTION: Create isolated ecommerce domain tables for Source Asia Storefront
-- TARGET DATABASE: Development PostgreSQL Database (erp_sales)
-- ==============================================================================

-- 1. ECOMMERCE CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.ecom_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    company_name VARCHAR(255),
    gstin VARCHAR(15),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_customers_email ON public.ecom_customers(email);

-- 2. ECOMMERCE ADDRESSES TABLE
CREATE TABLE IF NOT EXISTS public.ecom_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecom_customer_id UUID NOT NULL REFERENCES public.ecom_customers(id) ON DELETE CASCADE,
    address_type VARCHAR(20) NOT NULL DEFAULT 'shipping',
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address_line_1 TEXT NOT NULL,
    address_line_2 TEXT,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_addresses_customer_id ON public.ecom_addresses(ecom_customer_id);

-- 3. ECOMMERCE ORDER NUMBER SEQUENCE
CREATE SEQUENCE IF NOT EXISTS public.ecom_order_number_seq START WITH 100001 INCREMENT BY 1;

-- 4. ECOMMERCE ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.ecom_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) NOT NULL UNIQUE DEFAULT ('ECOM-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('public.ecom_order_number_seq')::text, 6, '0')),
    ecom_customer_id UUID REFERENCES public.ecom_customers(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    shipping_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    shipping_address_snapshot JSONB NOT NULL,
    billing_address_snapshot JSONB NOT NULL,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_orders_customer_id ON public.ecom_orders(ecom_customer_id);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_order_number ON public.ecom_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_status ON public.ecom_orders(status);

-- 5. ECOMMERCE ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.ecom_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecom_order_id UUID NOT NULL REFERENCES public.ecom_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    product_name_snapshot TEXT NOT NULL,
    sku_snapshot VARCHAR(100) NOT NULL,
    quantity NUMERIC(15, 3) NOT NULL DEFAULT 1.000,
    unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_order_items_order_id ON public.ecom_order_items(ecom_order_id);
CREATE INDEX IF NOT EXISTS idx_ecom_order_items_product_id ON public.ecom_order_items(product_id);

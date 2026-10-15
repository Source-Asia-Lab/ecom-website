BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.ecom_support_ticket_number_seq START WITH 100001;

CREATE TABLE IF NOT EXISTS public.ecom_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_email VARCHAR(255) NOT NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(120) NOT NULL,
    before_data JSONB,
    after_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_audit_entity
    ON public.ecom_audit_log (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ecom_notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(40) NOT NULL CHECK (event_type IN (
        'ORDER_RECEIVED', 'PAYMENT_RESULT', 'DISPATCH', 'DELIVERY', 'CANCELLATION', 'REFUND_RESULT', 'SUPPORT_UPDATE'
    )),
    channel VARCHAR(10) NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
    recipient VARCHAR(320) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'PROCESSING', 'RETRY', 'SENT', 'DEAD'
    )),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    provider_message_id VARCHAR(255),
    ecom_order_id UUID REFERENCES public.ecom_orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ecom_notification_outbox_ready
    ON public.ecom_notification_outbox (next_attempt_at, created_at)
    WHERE status IN ('PENDING', 'RETRY');

CREATE TABLE IF NOT EXISTS public.ecom_support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(40) NOT NULL UNIQUE DEFAULT
        ('SA-SUP-' || LPAD(NEXTVAL('public.ecom_support_ticket_number_seq')::text, 6, '0')),
    ecom_customer_id UUID REFERENCES public.ecom_customers(id) ON DELETE SET NULL,
    ecom_order_id UUID REFERENCES public.ecom_orders(id) ON DELETE SET NULL,
    order_number VARCHAR(50),
    customer_name VARCHAR(200) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    subject VARCHAR(160) NOT NULL,
    category VARCHAR(40) NOT NULL CHECK (category IN (
        'ORDER', 'PAYMENT', 'RETURN', 'REFUND', 'PRODUCT', 'PRIVACY', 'OTHER'
    )),
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN (
        'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'
    )),
    assigned_to VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_support_tickets_queue
    ON public.ecom_support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecom_support_tickets_customer
    ON public.ecom_support_tickets (LOWER(customer_email), created_at DESC);

CREATE TABLE IF NOT EXISTS public.ecom_support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.ecom_support_tickets(id) ON DELETE CASCADE,
    author_email VARCHAR(255) NOT NULL,
    author_role VARCHAR(12) NOT NULL CHECK (author_role IN ('CUSTOMER', 'STAFF')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_support_messages_ticket
    ON public.ecom_support_messages (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.ecom_refund_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecom_order_id UUID NOT NULL REFERENCES public.ecom_orders(id) ON DELETE RESTRICT,
    requested_by VARCHAR(255) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
        'REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED'
    )),
    reviewed_by VARCHAR(255),
    review_note TEXT,
    external_reference VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ecom_refund_requests_order
    ON public.ecom_refund_requests (ecom_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecom_refund_requests_status
    ON public.ecom_refund_requests (status, created_at DESC);

COMMIT;
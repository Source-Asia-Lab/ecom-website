ALTER TABLE public.ecom_product_catalog
    ADD COLUMN IF NOT EXISTS name_override VARCHAR(250),
    ADD COLUMN IF NOT EXISTS description_override TEXT,
    ADD COLUMN IF NOT EXISTS price_override NUMERIC(15, 2),
    ADD COLUMN IF NOT EXISTS image_url_override TEXT;

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ecom_product_catalog_price_override_nonnegative'
          AND conrelid = 'public.ecom_product_catalog'::regclass
    ) THEN
        ALTER TABLE public.ecom_product_catalog
            ADD CONSTRAINT ecom_product_catalog_price_override_nonnegative
            CHECK (price_override IS NULL OR price_override >= 0);
    END IF;
END
$migration$;

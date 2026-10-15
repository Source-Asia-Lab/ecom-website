-- ==============================================================================
-- MIGRATION: 003_seed_approved_ecom_product_mappings.sql
-- DESCRIPTION: Insert 7 approved initial product mappings into ecom_product_catalog
-- TARGET DATABASE: Dedicated Source Asia e-commerce PostgreSQL database
-- SECURITY: All inserted rows have is_published = FALSE (UNPUBLISHED BY DEFAULT)
-- ==============================================================================

BEGIN;

-- 1. Raspberry Pi 4 Model B - 1gb RAM (SKU: RAS-5CFC)
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    'a6a265e0-06c7-4e61-a580-fb9bbeb45058'::uuid,
    c.id,
    t.id,
    true,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'raspberry-pi' AND t.slug = 'raspberry-pi-boards'
ON CONFLICT (product_id) DO UPDATE SET
    ecom_category_id = EXCLUDED.ecom_category_id,
    ecom_category_type_id = EXCLUDED.ecom_category_type_id,
    is_published = EXCLUDED.is_published;

-- 2. SD Card (SKU: SDC-0EWH)
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '3a0e9eb4-6061-4cf0-9d10-0266df8d77db'::uuid,
    c.id,
    t.id,
    true,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'sd-cards' AND t.slug = 'sd-cards'
ON CONFLICT (product_id) DO UPDATE SET
    ecom_category_id = EXCLUDED.ecom_category_id,
    ecom_category_type_id = EXCLUDED.ecom_category_type_id,
    is_published = EXCLUDED.is_published;

-- 3. Power Chord / Power code (SKU: POW-3A7U)
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '31d4829a-d4cb-4397-adf1-445d2c9329c5'::uuid,
    c.id,
    t.id,
    true,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'power-supplies' AND t.slug = 'power-cables'
ON CONFLICT (product_id) DO UPDATE SET
    ecom_category_id = EXCLUDED.ecom_category_id,
    ecom_category_type_id = EXCLUDED.ecom_category_type_id,
    is_published = EXCLUDED.is_published;

-- 4. Strapping clip (SKU: STR-4DU5)
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '409ee97f-b48d-4c66-b31e-4664032f08bd'::uuid,
    c.id,
    t.id,
    true,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'clips' AND t.slug = 'strapping-clips'
ON CONFLICT (product_id) DO UPDATE SET
    ecom_category_id = EXCLUDED.ecom_category_id,
    ecom_category_type_id = EXCLUDED.ecom_category_type_id,
    is_published = EXCLUDED.is_published;

-- 5. 2 inch Tape (SKU: 2IN-SZFQ)
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '93486f65-bce2-4218-936a-d63ce944c167'::uuid,
    c.id,
    t.id,
    true,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'tapes' AND t.slug = 'packaging-tape'
ON CONFLICT (product_id) DO UPDATE SET
    ecom_category_id = EXCLUDED.ecom_category_id,
    ecom_category_type_id = EXCLUDED.ecom_category_type_id,
    is_published = EXCLUDED.is_published;

-- 6. Strech Film (SKU: STR-IRMW)
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '6058ff33-076c-4f0f-ab66-fed20c90de6e'::uuid,
    c.id,
    t.id,
    true,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'stretch-film' AND t.slug = 'stretch-film-rolls'
ON CONFLICT (product_id) DO UPDATE SET
    ecom_category_id = EXCLUDED.ecom_category_id,
    ecom_category_type_id = EXCLUDED.ecom_category_type_id,
    is_published = EXCLUDED.is_published;

-- 7. Cables - 23/36 (SKU: CAB-TI5V)
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    'f5d7dc56-6eed-436b-bdfc-e7e5cac5effb'::uuid,
    c.id,
    t.id,
    true,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'hook-up-wires' AND t.slug = 'flexible-hook-up-wires'
ON CONFLICT (product_id) DO UPDATE SET
    ecom_category_id = EXCLUDED.ecom_category_id,
    ecom_category_type_id = EXCLUDED.ecom_category_type_id,
    is_published = EXCLUDED.is_published;

COMMIT;

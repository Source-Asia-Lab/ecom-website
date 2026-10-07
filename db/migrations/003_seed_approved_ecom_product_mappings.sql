-- ==============================================================================
-- MIGRATION: 003_seed_approved_ecom_product_mappings.sql
-- DESCRIPTION: Insert 7 approved initial product mappings into ecom_product_catalog
-- TARGET DATABASE: Development PostgreSQL Database (erp_sales)
-- SECURITY: All inserted rows have is_published = FALSE (UNPUBLISHED BY DEFAULT)
-- ==============================================================================

BEGIN;

-- 1. Raspberry Pi 4 Model B - 1gb RAM
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '5bfefb6c-690d-4a7e-b10a-7a3bb43c51d0'::uuid,
    c.id,
    t.id,
    false,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'raspberry-pi' AND t.slug = 'raspberry-pi-boards'
ON CONFLICT (product_id) DO NOTHING;

-- 2. SD Card
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '4a127412-9712-4b42-9b03-b80737005426'::uuid,
    c.id,
    t.id,
    false,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'sd-cards' AND t.slug = 'sd-cards'
ON CONFLICT (product_id) DO NOTHING;

-- 3. Power Chord
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '06625016-64b5-4898-a730-18c61e2d5658'::uuid,
    c.id,
    t.id,
    false,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'power-supplies' AND t.slug = 'power-cables'
ON CONFLICT (product_id) DO NOTHING;

-- 4. Strapping clip
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '1d65dce5-8d4d-4e9e-a975-849ff6ca0e41'::uuid,
    c.id,
    t.id,
    false,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'clips' AND t.slug = 'strapping-clips'
ON CONFLICT (product_id) DO NOTHING;

-- 5. 2 inch Tape
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    '2b5bef07-01f1-4326-9fcc-5768d89eef9e'::uuid,
    c.id,
    t.id,
    false,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'tapes' AND t.slug = 'packaging-tape'
ON CONFLICT (product_id) DO NOTHING;

-- 6. Strech Film
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    'de253afb-76b8-48a2-87d4-7aeec2173961'::uuid,
    c.id,
    t.id,
    false,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'stretch-film' AND t.slug = 'stretch-film-rolls'
ON CONFLICT (product_id) DO NOTHING;

-- 7. Cables - 23/36
INSERT INTO public.ecom_product_catalog (product_id, ecom_category_id, ecom_category_type_id, is_published, display_order)
SELECT 
    'c1005568-c645-47e6-82f8-eaaf69802410'::uuid,
    c.id,
    t.id,
    false,
    0
FROM public.ecom_categories c
JOIN public.ecom_category_types t ON t.ecom_category_id = c.id
WHERE c.slug = 'hook-up-wires' AND t.slug = 'flexible-hook-up-wires'
ON CONFLICT (product_id) DO NOTHING;

COMMIT;

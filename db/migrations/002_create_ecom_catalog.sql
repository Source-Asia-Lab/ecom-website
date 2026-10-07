-- ==============================================================================
-- MIGRATION: 002_create_ecom_catalog.sql
-- DESCRIPTION: Create ecommerce catalog tables and seed initial ecommerce taxonomy
-- TARGET DATABASE: Development PostgreSQL Database (erp_sales)
-- ==============================================================================

-- 1. ECOMMERCE CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.ecom_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    slug VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_categories_slug ON public.ecom_categories(slug);

-- 2. ECOMMERCE CATEGORY TYPES TABLE
CREATE TABLE IF NOT EXISTS public.ecom_category_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecom_category_id UUID NOT NULL REFERENCES public.ecom_categories(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ecom_category_types_category_slug_key UNIQUE (ecom_category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_ecom_category_types_category_id ON public.ecom_category_types(ecom_category_id);
CREATE INDEX IF NOT EXISTS idx_ecom_category_types_slug ON public.ecom_category_types(slug);

-- 3. ECOMMERCE PRODUCT CATALOG MAPPING TABLE
CREATE TABLE IF NOT EXISTS public.ecom_product_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL UNIQUE, -- Application-level reference to public.products(id)
    ecom_category_id UUID NOT NULL REFERENCES public.ecom_categories(id) ON DELETE CASCADE,
    ecom_category_type_id UUID REFERENCES public.ecom_category_types(id) ON DELETE SET NULL,
    is_published BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecom_product_catalog_product_id ON public.ecom_product_catalog(product_id);
CREATE INDEX IF NOT EXISTS idx_ecom_product_catalog_category_id ON public.ecom_product_catalog(ecom_category_id);
CREATE INDEX IF NOT EXISTS idx_ecom_product_catalog_category_type_id ON public.ecom_product_catalog(ecom_category_type_id);
CREATE INDEX IF NOT EXISTS idx_ecom_product_catalog_is_published ON public.ecom_product_catalog(is_published);

-- ==============================================================================
-- SEED 12 UNIQUE ECOMMERCE CATEGORIES (ECOMMERCE DATA ONLY)
-- ==============================================================================

INSERT INTO public.ecom_categories (name, slug, display_order) VALUES
('Raspberry Pi', 'raspberry-pi', 1),
('SD Cards', 'sd-cards', 2),
('Power Supplies', 'power-supplies', 3),
('Clips', 'clips', 4),
('Stickers', 'stickers', 5),
('Handtools', 'handtools', 6),
('Loctites', 'loctites', 7),
('Stretch Film', 'stretch-film', 8),
('Tapes', 'tapes', 9),
('Gloves', 'gloves', 10),
('Hook Up Wires', 'hook-up-wires', 11),
('Office Supplies', 'office-supplies', 12)
ON CONFLICT (name) DO NOTHING;

-- ==============================================================================
-- SEED INITIAL ECOMMERCE CATEGORY TYPES
-- ==============================================================================

-- 1. Raspberry Pi Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Raspberry Pi Boards', 'raspberry-pi-boards', 1),
  ('Raspberry Pi Kits', 'raspberry-pi-kits', 2),
  ('Raspberry Pi Accessories', 'raspberry-pi-accessories', 3)
) AS t(name, slug, ord)
WHERE c.slug = 'raspberry-pi'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 2. SD Cards Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('SD Cards', 'sd-cards', 1),
  ('microSD Cards', 'microsd-cards', 2),
  ('SD Card Adapters', 'sd-card-adapters', 3)
) AS t(name, slug, ord)
WHERE c.slug = 'sd-cards'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 3. Power Supplies Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('AC Adapters', 'ac-adapters', 1),
  ('DC Power Supplies', 'dc-power-supplies', 2),
  ('USB Power Supplies', 'usb-power-supplies', 3),
  ('Power Adapters', 'power-adapters', 4),
  ('Power Cables', 'power-cables', 5)
) AS t(name, slug, ord)
WHERE c.slug = 'power-supplies'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 4. Clips Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Strapping Clips', 'strapping-clips', 1),
  ('Cable Clips', 'cable-clips', 2),
  ('Retaining Clips', 'retaining-clips', 3),
  ('Fastening Clips', 'fastening-clips', 4)
) AS t(name, slug, ord)
WHERE c.slug = 'clips'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 5. Stickers Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Product Labels', 'product-labels', 1),
  ('Barcode Labels', 'barcode-labels', 2),
  ('Warning Stickers', 'warning-stickers', 3),
  ('Industrial Stickers', 'industrial-stickers', 4)
) AS t(name, slug, ord)
WHERE c.slug = 'stickers'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 6. Handtools Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Screwdrivers', 'screwdrivers', 1),
  ('Pliers', 'pliers', 2),
  ('Cutters', 'cutters', 3),
  ('Wrenches', 'wrenches', 4),
  ('Hex Keys', 'hex-keys', 5),
  ('Hand Tool Sets', 'hand-tool-sets', 6)
) AS t(name, slug, ord)
WHERE c.slug = 'handtools'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 7. Loctites Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Threadlockers', 'threadlockers', 1),
  ('Retaining Compounds', 'retaining-compounds', 2),
  ('Thread Sealants', 'thread-sealants', 3),
  ('Structural Adhesives', 'structural-adhesives', 4)
) AS t(name, slug, ord)
WHERE c.slug = 'loctites'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 8. Stretch Film Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Hand Stretch Film', 'hand-stretch-film', 1),
  ('Machine Stretch Film', 'machine-stretch-film', 2),
  ('Pre-Stretch Film', 'pre-stretch-film', 3),
  ('Stretch Film Rolls', 'stretch-film-rolls', 4)
) AS t(name, slug, ord)
WHERE c.slug = 'stretch-film'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 9. Tapes Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Packaging Tape', 'packaging-tape', 1),
  ('Double-Sided Tape', 'double-sided-tape', 2),
  ('Electrical Tape', 'electrical-tape', 3),
  ('PTFE Tape', 'ptfe-tape', 4),
  ('Masking Tape', 'masking-tape', 5),
  ('Industrial Adhesive Tape', 'industrial-adhesive-tape', 6)
) AS t(name, slug, ord)
WHERE c.slug = 'tapes'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 10. Gloves Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Cotton Gloves', 'cotton-gloves', 1),
  ('Nitrile Gloves', 'nitrile-gloves', 2),
  ('Latex Gloves', 'latex-gloves', 3),
  ('Cut-Resistant Gloves', 'cut-resistant-gloves', 4),
  ('Safety Gloves', 'safety-gloves', 5)
) AS t(name, slug, ord)
WHERE c.slug = 'gloves'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 11. Hook Up Wires Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Single-Core Wires', 'single-core-wires', 1),
  ('PVC Hook-Up Wires', 'pvc-hook-up-wires', 2),
  ('Flexible Hook-Up Wires', 'flexible-hook-up-wires', 3),
  ('Electronic Hook-Up Wires', 'electronic-hook-up-wires', 4)
) AS t(name, slug, ord)
WHERE c.slug = 'hook-up-wires'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

-- 12. Office Supplies Types
INSERT INTO public.ecom_category_types (ecom_category_id, name, slug, display_order)
SELECT id, t.name, t.slug, t.ord
FROM public.ecom_categories c,
(VALUES
  ('Pens', 'pens', 1),
  ('Notebooks', 'notebooks', 2),
  ('Files & Folders', 'files-folders', 3),
  ('Markers', 'markers', 4),
  ('Labels', 'labels', 5),
  ('Stationery', 'stationery', 6)
) AS t(name, slug, ord)
WHERE c.slug = 'office-supplies'
ON CONFLICT (ecom_category_id, slug) DO NOTHING;

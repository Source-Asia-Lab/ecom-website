# Source Asia E-Commerce Architecture & Technical Documentation

Welcome to the **Source Asia Direct E-Commerce Platform**. This repository contains a modern, high-performance B2B & B2C industrial e-commerce application built with **Next.js (App Router)**, **React 19**, **Zustand**, and **PostgreSQL (Azure Flexible Server)**.

This documentation serves as an all-in-one technical guide for developers, engineers, and maintainers to understand the frontend, backend, database schema, state management, API routes, data flow, and environment configurations.

---

## 📑 Table of Contents

1. [System Architecture Overview](#-system-architecture-overview)
2. [Tech Stack](#-tech-stack)
3. [Project Directory Structure](#-project-directory-structure)
4. [Frontend Architecture](#-frontend-architecture)
   - [Pages & Routing](#pages--routing)
   - [State Management (Zustand Stores)](#state-management-zustand-stores)
   - [Key UI Components & Layouts](#key-ui-components--layouts)
5. [Backend & Database Architecture](#-backend--database-architecture)
   - [Database Connection & Pooling](#database-connection--pooling)
   - [Database Schemas & Table Relationships](#database-schemas--table-relationships)
   - [E-Commerce Domain Tables (Steps 1, 4, 6)](#e-commerce-domain-tables)
   - [Read-Only ERP Access Layer (Step 3)](#read-only-erp-access-layer)
   - [Server-Side E-Commerce Catalog Service (Step 7)](#server-side-e-commerce-catalog-service)
   - [Dynamic Taxonomy & Encoding Normalization](#dynamic-taxonomy--encoding-normalization)
   - [Image Resolution Engine](#image-resolution-engine)
   - [Development Product Allowlist](#development-product-allowlist)
6. [API Routes Reference](#-api-routes-reference)
7. [Environment Variables & Configuration](#-environment-variables--configuration)
8. [Database Migration History](#-database-migration-history)
9. [Developer Quick Start & Commands](#-developer-quick-start--commands)
10. [How to Make Changes (Developer Guidelines)](#-how-to-make-changes-developer-guidelines)

---

## 🏗️ System Architecture Overview

```mermaid
graph TD
    subgraph Client Layer [Browser / Client Side]
        UI[Next.js React Client Components]
        Stores[Zustand Stores\n- Cart Store\n- Wishlist Store\n- Delivery Store]
        Storage[(Local / Session Storage)]
        UI <--> Stores
        Stores <--> Storage
    end

    subgraph App Layer [Next.js App Router Backend]
        Pages[Server Components / Pages\n- /store\n- /store/[slug]\n- /checkout\n- /support]
        APIs[API Route Handlers\n- /api/ecommerce/catalog\n- /api/ecommerce/catalog/[id]\n- /api/ecommerce/categories\n- /api/ecommerce/categories/[categoryId]/types\n- /api/products\n- /api/pincode\n- /api/db-test]
        EcomService[E-Commerce Catalog Service\napp/lib/ecommerce-catalog-service.ts]
        ErpReadonly[ERP Read-Only Layer\napp/lib/erp-readonly.ts]
        DBClient[Database Client & Pool\npg.Pool / lib/db.ts]
        Taxonomy[Taxonomy & Image Resolver\napp/lib/image-resolver.ts]
    end

    subgraph External & Database
        PgDB[(Azure PostgreSQL Flex Server\nDatabase: erp_sales)]
        EcomTables[(E-Commerce Domain Tables\n- ecom_product_catalog\n- ecom_categories\n- ecom_category_types\n- ecom_customers\n- ecom_addresses\n- ecom_orders\n- ecom_order_items)]
        ErpTables[(ERP Read-Only Tables\n- public.products\n- public.inventory_bin_stock\n- public.client_organisations)]
        PostalAPI[Postal PIN Code API\napi.postalpincode.in]
    end

    Client Layer -->|HTTP / Fetch Requests| Pages
    Client Layer -->|REST Fetch API| APIs
    APIs --> EcomService
    EcomService --> ErpReadonly
    EcomService --> DBClient
    ErpReadonly --> DBClient
    DBClient -->|PostgreSQL SSL| PgDB
    PgDB --- EcomTables
    PgDB --- ErpTables
    APIs --> Taxonomy
    APIs -->|Pincode Verification| PostalAPI
```

---

## 🛠️ Tech Stack

| Domain | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | Next.js 16.3.6 (App Router) | Full-stack React framework with Server Components & Route Handlers |
| **UI Library** | React 19.2.8 | UI component renderer |
| **State Management** | Zustand 5.0.15 | Lightweight state stores with `persist` middleware for LocalStorage hydration |
| **Database** | PostgreSQL 14+ | Azure PostgreSQL Flexible Server (`erp_sales` DB) |
| **Database Driver** | `pg` (node-postgres 8.23.0) | Node.js connection pooling client for PostgreSQL |
| **Styling** | Tailwind CSS v4 + Vanilla CSS | `app/globals.css` with CSS custom properties and design system |
| **Language** | TypeScript 5+ | Strict type checking across API routes, UI components, and DB rows |
| **External API** | India Post API (`api.postalpincode.in`) | PIN code lookup and postal district/state validation |

---

## 📁 Project Directory Structure

```text
sourceasia-ecommerce/
├── app/                         # Next.js App Router root directory
│   ├── api/                     # Serverless API Route Handlers
│   │   ├── categories/          # Legacy: GET active categories endpoint
│   │   ├── db-app-tables/       # Diagnostics: lists app specific tables
│   │   ├── db-tables/           # Diagnostics: lists base DB tables
│   │   ├── db-test/             # Diagnostics: PostgreSQL connection ping
│   │   ├── ecommerce/           # Dedicated E-Commerce Catalog API Routes (Step 7)
│   │   │   ├── catalog/         # GET published products catalog list & filter
│   │   │   │   └── [id]/        # GET published product by ERP product UUID
│   │   │   └── categories/      # GET published e-commerce categories
│   │   │       └── [categoryId]/types/ # GET category types for category
│   │   ├── pincode/             # PIN Code & location search API
│   │   └── products/            # Products search, filter, and detail endpoints
│   ├── checkout/                # Checkout page & GST / B2B order calculation logic
│   │   ├── checkout-utils.ts    # GST calculation (IGST vs CGST/SGST) & validation
│   │   └── page.tsx             # Interactive checkout page with timer & draft builder
│   ├── components/              # React components grouped by feature
│   │   ├── cart/                # Add to cart buttons, cart hydrator, indicator
│   │   ├── products/            # Product cards, detail view, filter sidebar, grids
│   │   ├── site/                # Header, footer, hero, modals, support, ribbons
│   │   └── ui.tsx               # Reusable UI primitives (Container, TextLink, etc.)
│   ├── lib/                     # Database utilities & resolution engine
│   │   ├── db.ts                # Database query helpers & DB row transformer
│   │   ├── db-products.ts       # Main product data query engine with filters
│   │   ├── dev-storefront-metadata.ts # Dev mode metadata overrides
│   │   ├── ecom-catalog.ts      # E-commerce catalog data helpers (Step 4)
│   │   ├── ecommerce-catalog-service.ts # Server-side E-Commerce Catalog Read Service (Step 7)
│   │   ├── erp-readonly.ts      # Strict Read-Only ERP access module (Step 3)
│   │   ├── image-cache.json     # Cached image resolution map
│   │   └── image-resolver.ts    # Fallback image search engine & mapping
│   ├── store/                   # Product catalog pages & Zustand stores
│   │   ├── [slug]/              # Dynamic single product page
│   │   ├── cart-store.ts        # Zustand cart store (persisted)
│   │   ├── category-taxonomy.ts # E-commerce taxonomy & subcategories
│   │   ├── delivery-store.ts    # Delivery location & PIN code store
│   │   ├── page.tsx             # Main /store server page
│   │   ├── products.ts          # Product interface & global product cache helpers
│   │   ├── storefront.tsx       # Client-side interactive storefront layout
│   │   └── wishlist-store.ts    # Zustand wishlist store (persisted)
│   ├── support/                 # Customer support page shell
│   ├── favicon.ico              # Site favicon
│   ├── globals.css              # Main global styles & CSS variable design system
│   ├── layout.tsx               # Root HTML layout metadata & font configuration
│   └── page.tsx                 # Home page component
├── db/                          # Database migrations directory
│   └── migrations/              # Incremental SQL migration scripts
│       ├── 001_create_ecom_tables.sql # Step 1: Customers, Addresses, Orders
│       ├── 002_create_ecom_catalog.sql # Step 4: E-Commerce Categories, Types & Product Catalog
│       └── 003_seed_approved_ecom_product_mappings.sql # Step 6: 7 Approved Product Mappings
├── lib/                         # Global database pool singleton
│   └── db.ts                    # PostgreSQL connection pool export (`pool`)
├── public/                      # Static assets (images, product photos, icons)
├── .env.local                   # Local secret database credentials (DO NOT COMMIT)
├── .env.development.local       # Local development product allowlist UUIDs/SKUs
├── next.config.ts               # Next.js build configuration
├── package.json                 # Project dependencies & scripts
└── tsconfig.json                # TypeScript compiler config
```

---

## 🎨 Frontend Architecture

### Pages & Routing

- **`/` (`app/page.tsx`)**:
  - Landing page featuring header navigation, main product hero, interactive category ribbons, featured product showcases, process flow explanation, support teaser, and customer review ribbons.
- **`/store` (`app/store/page.tsx` & `app/store/storefront.tsx`)**:
  - Main catalog storefront. Supports multi-category filtering, subcategory selection, text search (name, SKU, description), stock availability toggle (`inStock`, `outOfStock`), price range filtering (`minPrice`, `maxPrice`), and sorting (`A-Z`, `Z-A`, `Price Low to High`, `Price High to Low`).
- **`/store/[slug]` (`app/store/[slug]/page.tsx`)**:
  - Dynamic product detail page. Fetches product by UUID or SKU slug, renders stock availability status, specs, unit pricing, image gallery, and interactive "Add to Cart" form.
- **`/checkout` (`app/checkout/page.tsx`)**:
  - Industrial B2B Order Draft Builder with a 10-minute session countdown. Collects company details, contact person, email, phone, GSTIN, PO number, and billing/shipping addresses.
  - Automatically calculates state-based GST:
    - **Intrastate**: 9% CGST + 9% SGST
    - **Interstate**: 18% IGST
- **`/support` (`app/support/page.tsx` & `app/components/site/SupportClient.tsx`)**:
  - Help Center featuring interactive FAQ accordions, order tracking wizard, GST invoice requests, return policies, and direct inquiry forms.

### State Management (Zustand Stores)

1. **Cart Store (`app/store/cart-store.ts`)**:
   - Manages shopping cart items (`productId`, `quantity`).
   - Uses `zustand/middleware` (`persist`) storing items in `localStorage` under `sourceasia-cart`.
   - Built-in stock validation prevents adding more units than available inventory (`product.stock`).
   - Controlled hydration via `CartHydrator` (`app/components/cart/CartHydrator.tsx`) prevents React SSR/client mismatch errors.
2. **Wishlist Store (`app/store/wishlist-store.ts`)**:
   - Manages product IDs saved to wishlist.
   - Persisted in `localStorage` under `sourceasia-wishlist`.
3. **Delivery Store (`app/store/delivery-store.ts`)**:
   - Stores user's selected PIN code and location details (`pincode`, `postOffice`, `district`, `state`).
   - Persisted across `localStorage` (`sourceasia_delivery_pincode`) and `sessionStorage`.

---

## 🗄️ Backend & Database Architecture

### Database Connection & Pooling

The backend connects to **Azure PostgreSQL Flexible Server** via `pg.Pool`.

- Connection string is provided via `process.env.DATABASE_URL`.
- Configured in `lib/db.ts` (global pool) and `app/lib/db.ts` (app pool handler):
  ```typescript
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // SSL required for Azure PG Flex
    max: 10,                            // Maximum connections in pool
    idleTimeoutMillis: 30000,           // Close idle connections after 30s
    connectionTimeoutMillis: 5000,      // Timeout after 5s if DB is unreachable
  });
  ```
- Uses a global singleton pattern in development (`globalThis.pool`) to avoid leaking client connections during Next.js Hot Module Replacement (HMR).

---

### E-Commerce Domain Tables

The e-commerce platform maintains dedicated domain tables isolated from the core ERP database tables.

```sql
-- Step 1: Customers & Addresses
public.ecom_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    company_name VARCHAR(255),
    gstin VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

public.ecom_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.ecom_customers(id) ON DELETE CASCADE,
    address_type VARCHAR(20) NOT NULL, -- 'billing' | 'shipping'
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 1: E-Commerce Orders & Items
public.ecom_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id UUID REFERENCES public.ecom_customers(id),
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    shipping_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    po_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

public.ecom_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.ecom_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL, -- Logical reference to public.products(id)
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    quantity NUMERIC(15, 4) NOT NULL,
    unit_price NUMERIC(15, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 4: E-Commerce Categories, Types, and Catalog Mapping
public.ecom_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    image_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

public.ecom_category_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecom_category_id UUID NOT NULL REFERENCES public.ecom_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ecom_category_types_slug UNIQUE (ecom_category_id, slug)
);

public.ecom_product_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL UNIQUE, -- Application-level reference to public.products(id)
    ecom_category_id UUID NOT NULL REFERENCES public.ecom_categories(id),
    ecom_category_type_id UUID REFERENCES public.ecom_category_types(id),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Read-Only ERP Access Layer (Step 3)

Implemented in [`app/lib/erp-readonly.ts`](file:///c:/Users/ridhi%20malawade/OneDrive/Desktop/ecom%20website%20sourceasia/sourceasia-ecommerce/app/lib/erp-readonly.ts). Provides strict, read-only (`SELECT`) access functions to read raw ERP products (`public.products`) and inventory bin stock (`public.inventory_bin_stock`) without modifying any ERP data:

- `getErpActiveProducts(options)`
- `getErpProductById(id)`
- `getErpCategories()`
- `getErpSubcategories(categoryId)`
- `getErpProductInventory(productId)`

---

### Server-Side E-Commerce Catalog Service (Step 7)

Implemented in [`app/lib/ecommerce-catalog-service.ts`](file:///c:/Users/ridhi%20malawade/OneDrive/Desktop/ecom%20website%20sourceasia/sourceasia-ecommerce/app/lib/ecommerce-catalog-service.ts). Serves as the server-side gatekeeper that joins:
1. E-Commerce Catalog publication mapping (`public.ecom_product_catalog`)
2. E-Commerce Categories (`public.ecom_categories`) and Category Types (`public.ecom_category_types`)
3. ERP Product Data (`public.products`)
4. ERP Live Inventory (`public.inventory_bin_stock`)

#### Key Publication Rules:
- **Publication Gatekeeper**: Products are only exposed if `ecom_product_catalog.is_published = TRUE` AND `products.is_active = TRUE`.
- **Customer Price Rule**: `cost_price` is strictly hidden. If `sale_price` is missing or `0`, `price` is returned as `null` and `isPriceOnRequest` is set to `true`.
- **Stock Availability**:
  - `0` or less: `"out_of_stock"`
  - `1–100`: `"low_stock"`
  - `> 100`: `"in_stock"`

---

### Dynamic Taxonomy & Encoding Normalization

- **Encoding Cleaner (`normalizeProductText`)**: Fixes corrupted spec strings in raw ERP data (e.g. `?1%` becomes `±1%`, `?F` becomes `µF`).
- **Dynamic Category Derivation (`deriveProductTaxonomy`)**: If database category is unset or marked as `"Test category"`, the engine inspects product names using regex pattern matching to categorize into industrial hardware groups (Washers, Allen Bolts, Screws, Nuts, Electronic Components, Safety Gear, Packaging, etc.).

---

### Image Resolution Engine

Implemented in [`app/lib/image-resolver.ts`](file:///c:/Users/ridhi%20malawade/OneDrive/Desktop/ecom%20website%20sourceasia/sourceasia-ecommerce/app/lib/image-resolver.ts):
1. **Explicit DB Image**: If `image_url` is a valid HTTP URL, it is used directly.
2. **Development Override**: Uses local static public images mapped by SKU in dev mode.
3. **Regex Pattern Specification Map**: Matches keywords (e.g. `allen bolt`, `spring washer`, `cold rolled sheet`, `heat shrink`) to curated high-resolution photos.
4. **Fallback SVG**: If no image matches, a clean inline SVG placeholder (`DEFAULT_FALLBACK_IMAGE`) is rendered.
5. **Disk Cache**: Resolved image choices are stored in `app/lib/image-cache.json` to prevent re-parsing regexes on every query.

---

### Development Product Allowlist

To ensure consistent testing, when `NODE_ENV === "development"`, legacy product queries strictly filter results against allowed UUIDs & SKUs specified in `.env.development.local`:

```typescript
DEV_STOREFRONT_PRODUCT_IDS=93486f65-...,a6a265e0-...
DEV_STOREFRONT_PRODUCT_SKUS=RAS-5CFC,SDC-0EWH,...
```

---

## 🔌 API Routes Reference

| Endpoint | Method | Description | Query Parameters | Response Format |
| :--- | :--- | :--- | :--- | :--- |
| `/api/ecommerce/catalog` | `GET` | **Step 7 E-Commerce Catalog API** (Returns published products only) | `categoryId`, `typeId`, `search`, `limit`, `offset` | `{ products: PublishedProduct[], total: number }` |
| `/api/ecommerce/catalog/[id]` | `GET` | **Step 7 Product Detail API** (Returns 404 if unpublished) | `[id]` ERP Product UUID | `PublishedProduct` or `404 Not Found` |
| `/api/ecommerce/categories` | `GET` | **Step 7 Categories API** (Returns 12 active e-com categories) | None | `{ categories: EcommerceCategory[], total: number }` |
| `/api/ecommerce/categories/[categoryId]/types` | `GET` | **Step 7 Category Types API** (Returns types for category) | `[categoryId]` | `{ types: EcommerceCategoryType[], total: number }` |
| `/api/products` | `GET` | Fetches legacy filtered & paginated ERP products list | `search`, `category`, `subcategory`, `limit`, `offset`, `sortBy`, `inStock`, `outOfStock`, `minPrice`, `maxPrice` | `{ products: Product[], total: number, categories: string[], brands: string[] }` |
| `/api/products/[id]` | `GET` | Fetches a single ERP product by UUID or SKU | `[id]` route param | `Product` object or `404 Not Found` |
| `/api/categories` | `GET` | Fetches list of active legacy categories | None | `{ categories: string[] }` |
| `/api/pincode` | `GET` | Indian PIN Code & Post Office lookup via India Post API | `q` (e.g., `560001` or `Bangalore`) | `{ status: "OK", results: PostalResult[] }` |
| `/api/db-test` | `GET` | Database health diagnostic endpoint | None | `{ success: true, databaseTime: string }` |
| `/api/db-tables` | `GET` | Diagnostic listing of database tables | None | JSON array of table schemas and names |
| `/api/db-app-tables`| `GET` | Diagnostic listing of app-specific tables | None | JSON array of app tables |

---

## 🔑 Environment Variables & Configuration

Create a `.env.local` file in the project root with the following keys:

```bash
# PostgreSQL Database Connection String (Azure PG Flexible Server)
DATABASE_URL="postgresql://<user>:<password>@<azure-pg-host>:5432/erp_sales?sslmode=require"
```

Create a `.env.development.local` file for local development allowlisting:

```bash
DEV_STOREFRONT_PRODUCT_IDS=93486f65-bce2-4218-936a-d63ce944c167,a6a265e0-06c7-4e61-a580-fb9bbeb45058,3a0e9eb4-6061-4cf0-9d10-0266df8d77db,409ee97f-b48d-4c66-b31e-4664032f08bd,6058ff33-076c-4f0f-ab66-fed20c90de6e,31d4829a-d4cb-4397-adf1-445d2c9329c5,f5d7dc56-6eed-436b-bdfc-e7e5cac5effb
DEV_STOREFRONT_PRODUCT_SKUS=RAS-5CFC,SDC-0EWH,POW-3A7U,STR-4DU5,2IN-SZFQ,STR-IRMW,CAB-TI5V
```

> [!CAUTION]
> Never commit `.env.local` or sensitive database credentials to version control! `.env.local` is listed in `.gitignore`.

---

## 🗃️ Database Migration History

| Migration | Description | Status |
| :--- | :--- | :--- |
| `001_create_ecom_tables.sql` | **Step 1**: Creates `ecom_customers`, `ecom_addresses`, `ecom_orders`, `ecom_order_items`, and `ecom_order_number_seq`. | Applied |
| `002_create_ecom_catalog.sql` | **Step 4**: Creates `ecom_categories` (12 categories), `ecom_category_types` (54 types), and `ecom_product_catalog`. | Applied |
| `003_seed_approved_ecom_product_mappings.sql` | **Step 6**: Seeds the 7 approved development product mappings into `ecom_product_catalog` with `is_published = FALSE`. | Applied |

---

## 🚀 Developer Quick Start & Commands

### 1. Installation

Ensure Node.js v18+ is installed on your machine.

```bash
npm install
```

### 2. Running Development Server

Start the local server with hot reloading enabled:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Production Build & Execution

To test production build locally:

```bash
# Build the Next.js optimized bundle
npm run build

# Start production server
npm run start
```

### 4. Code Quality & Linting

Run ESLint to check for code standard violations:

```bash
npm run lint
```

---

## 🛠️ How to Make Changes (Developer Guidelines)

### Adding a New API Endpoint
1. Create a directory under `app/api/<endpoint_name>/`.
2. Add a `route.ts` file exposing standard HTTP handlers (`export async function GET(request: NextRequest) { ... }`).
3. Use the shared PostgreSQL client by importing `query` from `@/app/lib/db`.

### Modifying Database Queries or Product Schema
1. Update `DbProductRow` interface in `app/lib/db.ts` to match new columns in PostgreSQL.
2. Update `mapDbRowToProduct()` in `app/lib/db.ts` to map database fields to the frontend `Product` interface.
3. Update `getProductsFromDb()` in `app/lib/db-products.ts` if adding new SQL `WHERE` filter parameters.

### Adding a New UI Component
1. Place reusable components in `app/components/site/`, `app/components/products/`, or `app/components/cart/`.
2. Ensure interactive elements handling client state include `"use client";` at the top of the file.
3. Use CSS classes defined in `app/globals.css` to maintain consistent visual styling.

### Modifying Storefront Taxonomy or Categories
1. Update `ECOMMERCE_CATEGORIES` in `app/store/category-taxonomy.ts`.
2. Update regex rules in `deriveProductTaxonomy()` inside `app/lib/db.ts` if adding auto-categorization for new product types.

---

*Documentation updated for Source Asia E-Commerce Tech Team.*

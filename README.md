# Source Asia E-Commerce

A B2B/B2C storefront for Source Asia, built with Next.js and TypeScript. The application includes a product catalog, category browsing, product details, cart and wishlist state, checkout, delivery-location lookup, and customer support pages.

## Features

- Responsive storefront with product search, category filters, product details, and locally stored cart and wishlist.
- Checkout calculations for GST, including IGST and CGST/SGST.
- PostgreSQL-backed product and inventory data, with a separate e-commerce catalog for categories and publication status.
- Product image resolution with local assets and fallbacks.
- PIN-code and postal-location lookup through the India Post API.
- SQL migrations for e-commerce tables, catalog setup, and initial unpublished product mappings.

## Technology

- Next.js 16 App Router and React 19
- TypeScript
- PostgreSQL via `pg`
- Zustand for client-side cart, wishlist, and delivery state
- Tailwind CSS 4 and application styles in `app/globals.css`

## Getting started

### Requirements

- Node.js and npm
- A PostgreSQL database for database-backed catalog and API features

### Install and configure

```bash
npm install
```

Copy `.env.example` to `.env.local` and set `DATABASE_URL` to your PostgreSQL connection string:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Do not commit `.env.local` or put database credentials in source control. The optional `DEV_STOREFRONT_PRODUCT_IDS` and `DEV_STOREFRONT_PRODUCT_SKUS` settings can be used to limit products shown by the development storefront.

### Set up the database

Run the SQL files in `db/migrations` against the target PostgreSQL database, in numerical order:

1. `001_create_ecom_tables.sql`
2. `002_create_ecom_catalog.sql`
3. `003_seed_approved_ecom_product_mappings.sql`

The third migration creates initial catalog mappings as unpublished. Review and publish products through the database workflow before expecting them to appear in the public catalog. Confirm the target database and review each migration before applying it.

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server after building |

## Main pages

| Path | Description |
| --- | --- |
| `/` | Storefront home page |
| `/store` | Product catalog |
| `/store/[slug]` | Product detail page |
| `/checkout` | Cart checkout |
| `/support` | Customer support |

## API routes

The API routes are implemented as Next.js route handlers under `app/api`.

| Path | Purpose |
| --- | --- |
| `/api/ecommerce/catalog` | List published e-commerce catalog products |
| `/api/ecommerce/catalog/[id]` | Retrieve a catalog product |
| `/api/ecommerce/categories` | List e-commerce categories |
| `/api/ecommerce/categories/[categoryId]/types` | List types for a category |
| `/api/products` and `/api/products/[id]` | Product listing and detail endpoints |
| `/api/categories` | Category endpoint |
| `/api/pincode` | PIN-code and postal-location lookup |
| `/api/db-test`, `/api/db-tables`, `/api/db-app-tables` | Database diagnostic endpoints |

Database-backed routes require `DATABASE_URL`. The e-commerce catalog service only returns products that have an explicit catalog mapping, are marked as published, and correspond to active ERP products.

## Project layout

```text
app/
  api/                 Next.js API route handlers
  checkout/            Checkout page and calculations
  components/          Cart, product, site, and UI components
  lib/                 Database, catalog, ERP, and image helpers
  store/               Storefront pages and client-side state
  support/             Support page
db/
  migrations/          PostgreSQL schema and seed migrations
lib/                   Shared database pool
public/                Static product, category, and site images
```

## Deployment

Deploy as a Next.js application on a Node.js-compatible hosting platform. Configure `DATABASE_URL` in the hosting provider's secret/environment settings, apply database migrations to the intended database, then build and run:

```bash
npm run build
npm run start
```

## Contributing

Keep credentials and local environment files out of commits. When changing database-backed features, update the relevant migration and documentation alongside the application code.

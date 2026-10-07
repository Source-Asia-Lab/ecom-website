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
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=verify-full
```

Do not commit `.env.local` or put database credentials in source control. The optional `DEV_STOREFRONT_PRODUCT_IDS` and `DEV_STOREFRONT_PRODUCT_SKUS` settings can be used to limit products shown by the development storefront.

### Set up the database

Run the SQL files in `db/migrations` against the target PostgreSQL database, in numerical order:

1. `001_create_ecom_tables.sql`
2. `002_create_ecom_catalog.sql`
3. `003_seed_approved_ecom_product_mappings.sql`

The third migration creates initial catalog mappings as unpublished. Review and publish products through the database workflow before expecting them to appear in the public catalog. Confirm the target database and review each migration before applying it.

The storefront and order-request API both require an active ERP product with an explicitly published e-commerce catalog mapping. Order requests are stored in `ecom_orders` and `ecom_order_items`; make sure the application database role has only the required read and insert permissions.

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
| `npm test` | Run order-request validation tests |
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

The API routes are implemented as Next.js route handlers under `app/api`. `POST /api/orders` validates an order request against current published product prices and stock and saves the request and item snapshots in one database transaction. An order request is not a confirmed order, does not reserve stock, and does not take payment.

| Path | Purpose |
| --- | --- |
| `/api/ecommerce/catalog` | List published e-commerce catalog products |
| `/api/ecommerce/catalog/[id]` | Retrieve a catalog product |
| `/api/ecommerce/categories` | List e-commerce categories |
| `/api/ecommerce/categories/[categoryId]/types` | List types for a category |
| `/api/products` and `/api/products/[id]` | Product listing and detail endpoints |
| `/api/orders` | Submit a pending order request |
| `/api/categories` | Category endpoint |
| `/api/pincode` | PIN-code and postal-location lookup |
| `/api/db-test`, `/api/db-tables`, `/api/db-app-tables` | Database diagnostic endpoints |

Database-backed routes require `DATABASE_URL` with certificate-verifying TLS (`sslmode=verify-full` in production). The storefront and catalog endpoints only return active ERP products with an active category and a published catalog mapping. Database diagnostic routes are disabled in production. In production, `POST /api/orders` stays disabled unless `ORDER_REQUESTS_ENABLED=true`; only enable it after configuring hosting-level rate limiting and bot protection. Customer order requests are stored for manual review.

## Production readiness checklist

- Store `DATABASE_URL` in the hosting provider's secret settings. Production requires `sslmode=verify-full`; do not use `sslmode=require` or disable certificate verification.
- Use a dedicated database role with least privilege. Keep ERP access read-only and grant only the e-commerce writes needed to create order requests.
- Configure platform-level rate limiting and bot protection for public APIs, especially `POST /api/orders` and `/api/pincode`.
- Set up automated PostgreSQL backups, test restoring a backup, and monitor application and database errors without logging customer addresses or credentials.
- Configure hosting-level administrator authentication before adding any catalog-management or order-management API. This project currently has no authenticated admin API.
- The order-request flow does not process payment, reserve inventory, send confirmation email, or confirm a sale. Add a payment provider and verified webhooks only after selecting a provider and implementing the required order lifecycle.
- Review privacy, retention, and access policies before storing real customer order information.

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

# Source Asia E-Commerce

B2B/B2C storefront for Source Asia, built with **Next.js 16**, **React 19**, **TypeScript**, and **PostgreSQL**. Product, price, and stock data are read from the ERP database; orders, catalog publication, payments, support, and notifications live in a separate e-commerce database.

**Repository:** [github.com/Source-Asia-Lab/ecom-website](https://github.com/Source-Asia-Lab/ecom-website)

---

## Table of contents

- [What this project does](#what-this-project-does)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Local development](#local-development)
- [Database migrations](#database-migrations)
- [Environment variables](#environment-variables)
- [Checkout and payment flow](#checkout-and-payment-flow)
- [HTTP API reference](#http-api-reference)
- [Staff admin console](#staff-admin-console)
- [Testing](#testing)
- [Deployment notes](#deployment-notes)
- [Security](#security)
- [Production readiness](#production-readiness)

---

## What this project does

| Area | Behavior |
| --- | --- |
| **Storefront** | Browse categories and products, product detail, cart, wishlist, checkout, support, and policy pages (`/shipping`, `/payment`, `/returns-refunds`, `/privacy`, `/terms`). |
| **Catalog** | Staff publish ERP products into the e-commerce catalog with optional name, description, price, image, and stock overrides (migration 005–006). Unset overrides fall back to ERP values. |
| **Orders** | Server-side validation, repricing, GST line calculation (with manual review when ERP tax is missing), immutable line snapshots, 10-minute inventory holds, and idempotent `POST /api/orders`. |
| **Payments** | **Razorpay** — create gateway orders, client verify route, signed webhooks, payment attempts in `ecom_payments`, and idempotent confirmation. Local dev can use `ENABLE_PAYMENT_SIMULATION=true` with the checkout “simulate payment” path when keys are not set. |
| **Accounts** | Google OAuth (Auth.js v5), customer profile and saved addresses, order history for signed-in customers. |
| **Operations** | Staff-only `/admin` and APIs for order review, fulfilment, catalog, refunds (workflow only — no automatic payout), and support tickets. |
| **Notifications** | PostgreSQL outbox, Resend email, optional Twilio SMS, worker route for scheduled delivery. |
| **Tracking** | Public `GET /api/orders/{orderNumber}/track` returns order status and shipment rows when staff have recorded them. |

**Cart note:** The UI cart and wishlist use **Zustand in the browser**. A **server-side cart API** (`/api/cart`) exists for signed-in or session-token clients but is not wired into the main storefront yet.

**ERP note:** The app **reads** ERP product and inventory tables only. There is no automated ERP sales-order write-back.

---

## Architecture

```text
┌─────────────────┐     read-only      ┌──────────────────┐
│   Next.js app   │ ─────────────────► │  ERP PostgreSQL   │
│  (App Router)   │   DATABASE_URL     │ products, stock   │
└────────┬────────┘                    └──────────────────┘
         │
         │ read/write
         ▼
┌──────────────────┐
│ E-commerce DB    │  orders, catalog mappings, payments,
│ ECOMMERCE_       │  reservations, carts, support, outbox
│ DATABASE_URL     │
└──────────────────┘
         ▲
         │ webhooks / worker (scheduled)
┌────────┴────────┐
│ Razorpay, Resend│
│ Twilio (opt.)   │
└─────────────────┘
```

**Stack:** Next.js App Router, `pg` connection pools, Zustand, Tailwind CSS 4, NextAuth (Google).

---

## Repository layout

```text
app/
  api/              Route handlers (storefront, checkout, admin, webhooks, worker)
  admin/            Staff console (page)
  checkout/         Checkout UI and validation helpers
  components/       Product, site, auth, and support UI
  lib/              Database access, catalog, Razorpay, orders, tests
  store/            Storefront routes and client cart/wishlist state
auth.ts             Auth.js configuration
db/migrations/      Versioned SQL (apply only to the e-commerce database)
public/             Static assets
scripts/            Optional ad-hoc verification scripts (not part of CI)
types/              Shared TypeScript declarations
```

---

## Prerequisites

- Node.js compatible with Next.js 16 (see `package.json`)
- npm
- PostgreSQL: **two** databases (or two roles) — ERP (read-only) and e-commerce (read/write)

---

## Local development

```bash
npm install
cp .env.example .env.local
# Edit .env.local — see Environment variables
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Create a local e-commerce database (example)

```bash
createuser --pwprompt --no-superuser --no-createdb --no-createrole sourceasia_ecom_test
createdb --owner=sourceasia_ecom_test sourceasia_ecommerce
```

Use the password in `ECOMMERCE_DATABASE_URL` (URL-encode special characters). Local PostgreSQL may use `sslmode=disable`; remote hosts must use `sslmode=verify-full`.

### Google sign-in (optional locally)

1. Set `AUTH_SECRET` (`npx auth secret`), `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`.
2. Add redirect URI: `http://localhost:3000/api/auth/callback/google`.
3. Add staff emails to `AUTH_STAFF_EMAILS` (comma-separated, exact match) for `/admin` access.

### npm scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (no database required) |
| `npm run test:integration` | PostgreSQL integration tests (requires test DB URL) |
| `npm run test:all` | Unit + integration |
| `npm run build` | Production build |
| `npm run start` | Serve production build |

---

## Database migrations

Apply **only** to the e-commerce database (`ECOMMERCE_DATABASE_URL`), never to the ERP database.

| File | Purpose |
| --- | --- |
| `001_create_ecom_tables.sql` | Core order and customer tables |
| `002_create_ecom_catalog.sql` | Categories and product catalog mappings |
| `003_seed_approved_ecom_product_mappings.sql` | Seed mappings (unpublished by default) |
| `004_support_notifications_audit.sql` | Support tickets, outbox, audit log, refunds |
| `005_add_ecommerce_product_overrides.sql` | Storefront field overrides on catalog rows |
| `006_ecommerce_complete_schema.sql` | Reservations, carts, payments, shipments |
| `007_add_order_idempotency.sql` | Checkout idempotency records |

**PowerShell (apply all in order):**

```powershell
Get-ChildItem .\db\migrations\*.sql | Sort-Object Name | ForEach-Object {
  psql $env:ECOMMERCE_DATABASE_URL -v ON_ERROR_STOP=1 -f $_.FullName
}
```

Migration 003 references ERP product UUIDs without foreign keys into ERP — confirm IDs with the ERP owner before publishing in production.

---

## Environment variables

Copy from `.env.example`. Never commit `.env.local` or real secrets.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Read-only ERP PostgreSQL URL |
| `ECOMMERCE_DATABASE_URL` | Yes | E-commerce PostgreSQL URL |
| `AUTH_SECRET` | For sign-in | Auth.js encryption secret |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | For sign-in | Google OAuth web client |
| `AUTH_STAFF_EMAILS` | For admin | Comma-separated staff Google emails |
| `AUTH_TRUST_HOST` | Production | Set per host/proxy Auth.js guidance |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Production checkout | Razorpay API keys (server only) |
| `RAZORPAY_WEBHOOK_SECRET` | Production | Webhook signature verification |
| `ENABLE_PAYMENT_SIMULATION` | Local dev only | `true` with `NODE_ENV=development` to allow simulated payment without keys |
| `ORDER_REQUESTS_ENABLED` | Production orders | Must be `true` for `POST /api/orders` when `NODE_ENV=production` |
| `NOTIFICATION_WORKER_TOKEN` | Outbox worker | Bearer token for `POST /api/worker/notifications` |
| `RESEND_API_KEY`, `NOTIFICATION_*` | Email | Resend and routing addresses |
| `TWILIO_*` | Optional | SMS delivery |
| `DEV_STOREFRONT_PRODUCT_IDS` / `SKUS` | Optional dev | Limit visible products locally — not for production |

Integration tests use **`ECOMMERCE_TEST_DATABASE_URL`** (disposable DB name must contain `test` or `disposable`; must not match ERP or dev e-commerce URLs). See [Testing](#testing).

Optional Razorpay sandbox probe in tests: `RAZORPAY_TEST_KEY_ID` / `RAZORPAY_TEST_KEY_SECRET` (`rzp_test_*` only).

---

## Checkout and payment flow

The browser is untrusted: amounts, tax, stock, and payment status are always decided on the server.

1. Customer submits checkout → **`POST /api/orders`** with optional **`Idempotency-Key`** header.
2. Server validates address and lines, locks catalog rows, applies active inventory holds, creates a **`PENDING`** order, inserts **10-minute `HOLD`** reservations, and returns totals and `expiresAt`.
3. Client calls **`POST /api/checkout/razorpay/order`** with `orderNumber` to create or reuse a Razorpay order and `ecom_payments` row.
4. Customer pays via Razorpay (production) or, in development with `ENABLE_PAYMENT_SIMULATION=true`, uses the checkout simulate action → **`POST /api/checkout/razorpay/verify`**.
5. **`POST /api/webhooks/razorpay`** confirms payment from Razorpay with signature verification and idempotent event handling (preferred in production over redirect-only success).
6. On confirmation, reservations move to **`COMMITTED`**, order/payment statuses update, and notifications may be queued.

If the 10-minute hold expires before payment, the customer must place a new order.

---

## HTTP API reference

All routes live under `app/api/`. Diagnostic routes `GET /api/db-test`, `/api/db-tables`, and `/api/db-app-tables` return **404 in production**.

### Storefront and catalog

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/products`, `/api/products/[id]` | Product listing and detail (ERP-backed reads) |
| GET | `/api/categories` | Storefront categories |
| GET | `/api/ecommerce/catalog`, `/api/ecommerce/catalog/[id]` | Published e-commerce catalog |
| GET | `/api/ecommerce/categories`, `.../types` | E-commerce category taxonomy |
| GET | `/api/pincode` | India Post PIN lookup |

### Checkout, orders, payments

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/orders` | Create pending order + inventory hold (production needs `ORDER_REQUESTS_ENABLED=true`) |
| POST | `/api/checkout/razorpay/order` | Initialize Razorpay payment for an order |
| POST | `/api/checkout/razorpay/verify` | Verify payment signature / complete simulated test payment |
| POST | `/api/webhooks/razorpay` | Razorpay webhook (signed) |
| GET | `/api/orders/[orderNumber]/track` | Public order + shipment status |

### Customer (authenticated)

| Method | Path | Description |
| --- | --- | --- |
| * | `/api/auth/[...nextauth]` | Google OAuth session |
| GET/PATCH | `/api/account/profile` | Customer profile |
| GET/POST/PATCH/DELETE | `/api/account/addresses` | Saved addresses |
| GET | `/api/account/orders` | Orders linked to the signed-in customer |
| GET/POST | `/api/cart` | Server-side cart (optional client integration) |
| GET/POST | `/api/support/tickets` | Support tickets |

### Staff (`AUTH_STAFF_EMAILS`)

| Method | Path | Description |
| --- | --- | --- |
| GET/PATCH | `/api/admin/orders` | Order queue and fulfilment transitions |
| * | `/api/admin/orders/[orderNumber]/refunds` | Refund request workflow |
| GET | `/api/admin/refunds` | Refund queue |
| GET/POST/PATCH/DELETE | `/api/admin/catalog`, `/api/admin/catalog/[productId]` | Catalog publication and overrides |
| GET/PATCH | `/api/admin/support/tickets` | Support replies and status |

### Background

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/worker/notifications` | Process notification outbox (`Authorization: Bearer NOTIFICATION_WORKER_TOKEN`) |

**Catalog services:** Both `app/lib/ecom-catalog.ts` and `app/lib/ecommerce-catalog-service.ts` exist — extend the path already used by your route before adding new catalog behavior.

---

## Staff admin console

- **URL:** `/admin` (staff session only; same allowlist as admin APIs).
- **Capabilities:** Review pending orders, update fulfilment on paid orders, manage catalog publication/overrides, refund review, support ticket replies.
- **Refunds:** Approving or completing a refund is an audited workflow with external reference fields; the app does **not** call Razorpay refund APIs automatically.

Enforce MFA for staff Google accounts via your organization’s Workspace policy (not enforced inside this app).

---

## Testing

### Unit tests (fast, no database)

```bash
npm test
```

Runs **50** tests across validation, database URL guards, Razorpay signatures and webhooks, fulfilment transitions, concurrency/idempotency, account linking, and test-mode credential rules.

### Integration tests (real PostgreSQL)

1. Create an isolated database (name must include `test` or `disposable`):

   ```bash
   createdb -U postgres sourceasia_ecom_test
   ```

2. Set the URL (PowerShell example):

   ```powershell
   $env:ECOMMERCE_TEST_DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/sourceasia_ecom_test?sslmode=disable"
   ```

3. Run:

   ```bash
   npm run test:integration
   # or
   npm run test:all
   ```

Migrations **001–007** are applied automatically at the start of integration tests. Guards in `app/lib/test-database.ts` reject URLs that match `DATABASE_URL` or `ECOMMERCE_DATABASE_URL`.

---

## Deployment notes

Before deploy:

```bash
npm run lint
npm test
npm run build
```

1. Use separate dev, staging, and production databases and Razorpay accounts.
2. Apply migrations to staging first, then production with a controlled process.
3. Configure all secrets in the host’s secret manager (never `NEXT_PUBLIC_*` for private keys).
4. Set `ORDER_REQUESTS_ENABLED=true` only when checkout is ready for production traffic (with rate limiting and bot protection).
5. Register production webhook URL with Razorpay → `POST /api/webhooks/razorpay` and set `RAZORPAY_WEBHOOK_SECRET`.
6. Schedule **`POST /api/worker/notifications`** every minute (or agreed interval) with the worker bearer token. The worker uses `SKIP LOCKED`, retries with backoff, and marks jobs `DEAD` after repeated failures.

---

## Security

- Remote production databases: **`sslmode=verify-full`** for both URLs (`app/lib/db.ts` enforces this in production).
- Least privilege: ERP role read-only; e-commerce role limited to app tables; separate migration owner where possible.
- Do not log secrets, full payment payloads, or unnecessary PII.
- Keep diagnostic DB routes disabled in production.
- Rotate any credential that may have appeared in logs, chat, or commits.

---

## Production readiness

Use this as a launch checklist — several items are **implemented in code** but still need **business sign-off, credentials, or operations**:

- [ ] Finance/tax owner approves GST treatment, invoices, and displayed policy pages.
- [ ] Razorpay live keys, webhooks, and reconciliation process owned and tested end-to-end.
- [ ] `ORDER_REQUESTS_ENABLED`, rate limits, and monitoring configured on the host.
- [ ] Notification worker scheduled; Resend/Twilio verified senders configured.
- [ ] ERP write-back and carrier API integration defined (out of scope today).
- [ ] Automatic Razorpay refunds and downloadable GST invoices (out of scope today).
- [ ] Storefront wired to server-side cart if persistent cross-device carts are required.

---

## Contributing

Do not commit `.env.local`, passwords, or gateway secrets. Backend changes should include migrations, tests, and README updates where behavior or configuration changes. Do not modify ERP or production payment data outside approved, auditable procedures.

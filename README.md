# Source Asia E-Commerce

Source Asia is a B2B/B2C storefront built with Next.js, TypeScript, and PostgreSQL. This README is both the project setup guide and the backend, payment, deployment, and go-live checklist.

> **Production status:** Google OAuth, staff-only operations APIs, support tickets, an email/SMS outbox, and policy pages are implemented but require deployment credentials, migration 004, and an operating notification schedule. The project is not yet a complete paid-checkout system: the order endpoint saves pending requests and does not take payment, confirm paid orders, reserve inventory, or integrate carrier tracking.

## Contents

- [Current functionality](#current-functionality)
- [Technology and project structure](#technology-and-project-structure)
- [Local setup](#local-setup)
- [Database setup](#database-setup)
- [Current API](#current-api)
- [Required paid-order workflow](#required-paid-order-workflow)
- [Payment gateway decision](#payment-gateway-decision)
- [Backend and data additions](#backend-and-data-additions)
- [Security and privacy](#security-and-privacy)
- [Deployment runbook](#deployment-runbook)
- [Testing and acceptance criteria](#testing-and-acceptance-criteria)
- [Monitoring, support, and recovery](#monitoring-support-and-recovery)
- [Decisions for the project team](#decisions-for-the-project-team)
- [Go-live checklist](#go-live-checklist)

## Current Functionality

Implemented today:

- Storefront pages for product browsing, categories, product details, cart, wishlist, checkout, support, and PIN-code lookup.
- PostgreSQL-backed product and stock reads, with e-commerce category and publication mappings.
- Server-side order-request validation and repricing against current ERP product price and stock data.
- A transaction that stores a pending order request and product/address snapshots in `ecom_orders` and `ecom_order_items`.
- Local browser persistence for cart and wishlist. These are not customer accounts or server-side carts.
- PIN-code and postal lookup through the India Post API.
- Google OAuth sessions, verified-email customer order history, and staff access controlled by `AUTH_STAFF_EMAILS`.
- Persistent customer support tickets, staff replies, refund requests/review, catalog publication, and audited staff actions.
- A transactional notification outbox, support/order email/SMS worker, retry state, and dead-letter status. Provider credentials and a scheduled worker are required to deliver messages.
- Customer-facing shipping, payment, cancellation/returns/refunds, privacy, and terms pages.
- Staff-only `/admin` console for order-request review, paid-order fulfilment status, catalog publication, refund review, and support replies.

Not implemented yet; required for a full paid ecommerce launch:

- Payment gateway order creation, signed webhook handling, settlement reconciliation, and automatic payment-result handling.
- Confirmed order lifecycle, inventory reservation/release, and ERP sales-order integration.
- Full customer profile/address management and persistent auth-user records. Google OAuth sessions are active; account orders are linked through `ecom_customer_id` only when submitted while signed in.
- Staff MFA enforcement inside the application. Require MFA through the organization's Google Workspace policy for allowlisted staff accounts.
- Actual refund execution. Refunds can be requested, approved, rejected, and marked processing; completion requires a staff verification attestation and processor reference, but the app does not initiate the transfer.
- Shipping-rate calculation, shipment/fulfilment records, carrier integration, and customer order tracking.
- Downloadable GST invoices and provider-backed automatic payment-result messages. Dispatch/delivery messages are available through audited staff transitions for paid orders.

The current `POST /api/orders` route is intentionally an order-request endpoint. In production it is disabled unless `ORDER_REQUESTS_ENABLED=true`; enabling it only permits pending requests. It does not enable payments or turn requests into confirmed orders. The support/admin/refund/outbox APIs require migration 004.

Google sign-in requires `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`. Add `http://localhost:3000/api/auth/callback/google` and the production equivalent to the Google OAuth client's authorized redirect URIs. Add exact staff account emails to `AUTH_STAFF_EMAILS`; never grant staff roles from browser input.

## Technology and Project Structure

- Next.js 16 App Router, React 19, and TypeScript
- PostgreSQL through the `pg` package
- Zustand for browser-side cart, wishlist, and delivery state
- Tailwind CSS 4 and application styles in `app/globals.css`

```text
app/api/                 Next.js route handlers
app/checkout/            Checkout page and validation helpers
app/components/          Product, cart, site, and support UI
app/lib/                 Database, ERP reads, catalog, and order validation
app/store/                Storefront pages and browser-side state
db/migrations/            PostgreSQL ecommerce schema and catalog seeds
public/                   Static images and other public assets
```

## Local Setup

### Requirements

- Node.js version supported by the installed Next.js release
- npm
- PostgreSQL access to the ERP tables this app reads, and a separate PostgreSQL database for e-commerce data

Install dependencies and configure the local environment:

```bash
npm install
```

Copy `.env.example` to `.env.local`. `DATABASE_URL` is the ERP connection and must have read-only access to ERP tables. `ECOMMERCE_DATABASE_URL` must point to a separate database; all e-commerce writes use only this connection. Local PostgreSQL may use `sslmode=disable`; remote databases must use certificate-verifying TLS.

Set the e-commerce connection independently, for example:

```dotenv
ECOMMERCE_DATABASE_URL=postgresql://sourceasia_ecom_test:CHANGE_ME@localhost:5432/sourceasia_ecommerce?sslmode=disable
```

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=verify-full
```

For a local test database, create the dedicated login and database using a PostgreSQL admin account:

```bash
createuser --pwprompt --no-superuser --no-createdb --no-createrole sourceasia_ecom_test
createdb --owner=sourceasia_ecom_test sourceasia_ecommerce
```

Use the password entered at the `createuser` prompt in `ECOMMERCE_DATABASE_URL` (URL-encode special characters). This is a local database/API test login, not a storefront account. Storefront sign-in remains Google OAuth; local email/password sign-in is not implemented.

After creating the database and setting `ECOMMERCE_DATABASE_URL` in PowerShell, apply the migrations only to the e-commerce database:

```powershell
Get-ChildItem .\db\migrations\*.sql | Sort-Object Name | ForEach-Object {
  psql $env:ECOMMERCE_DATABASE_URL -v ON_ERROR_STOP=1 -f $_.FullName
}
```

Never commit `.env.local`, database passwords, gateway secrets, webhook secrets, or private keys. The optional development product allowlist variables are documented in `.env.example`.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Available scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server |
| `npm run lint` | Run ESLint |
| `npm test` | Run fast unit tests (validation, database safety, Razorpay signatures, fulfillment lifecycle, concurrency, account linking, test-mode credentials) |
| `npm run test:integration` | Run genuine PostgreSQL integration tests against dedicated disposable test database |
| `npm run test:all` | Run both unit tests and PostgreSQL integration tests |
| `npm run build` | Build the production application |
| `npm run start` | Serve the production build |

## Database Setup

The app reads ERP data from `public.products`, `public.inventory_bin_stock`, and related ERP category tables through `DATABASE_URL`. It uses `ECOMMERCE_DATABASE_URL` for the independent e-commerce database. Confirm ERP schema, database, organization/tenant boundaries, and read-only permissions with the ERP owner. Do not run e-commerce migrations against the ERP database.

Create a new PostgreSQL database (for example, `sourceasia_ecommerce`) and apply the migrations in numerical order to that database only:

1. `db/migrations/001_create_ecom_tables.sql`
2. `db/migrations/002_create_ecom_catalog.sql`
3. `db/migrations/003_seed_approved_ecom_product_mappings.sql`
4. `db/migrations/004_support_notifications_audit.sql`
5. `db/migrations/005_add_ecommerce_product_overrides.sql`

Important migration notes:

- Back up the target database and confirm the connection points to the intended environment before applying migrations.
- Migration 003 seeds e-commerce mappings for ERP product UUIDs as unpublished. These are application-level references and deliberately have no foreign key into ERP. Migration 005 adds optional e-commerce-only name, description, price, and image overrides; unset fields continue using ERP values, and stock/tax remain ERP-sourced.
- Keep `DATABASE_URL` read-only and grant it only the ERP `SELECT` permissions the app needs. Use a dedicated e-commerce DB role for `ECOMMERCE_DATABASE_URL`. In production, use a separate migration owner and restricted runtime role; never use an ERP or PostgreSQL administrator credential in the app.
- Add every future schema change as a reviewed, versioned migration. Test migrations against a staging copy before production.

## Current API

Routes are Next.js route handlers under `app/api`.

| Route | Current purpose |
| --- | --- |
| `GET /api/products` | Product listing and filters used by the storefront |
| `GET /api/products/[id]` | Published product detail |
| `GET /api/ecommerce/catalog` | Published ecommerce catalog listing |
| `GET /api/ecommerce/catalog/[id]` | Published catalog product detail |
| `GET /api/ecommerce/categories` | Active ecommerce categories |
| `GET /api/ecommerce/categories/[categoryId]/types` | Active types for a category |
| `GET /api/categories` | Storefront category data |
| `POST /api/orders` | Save a pending order request; not a paid order |
| `/api/auth/[...nextauth]` | Auth.js Google sign-in, callback, and session handlers |
| `GET /api/account/orders` | Recent orders linked to the signed-in customer record |
| `GET /api/admin/orders` | Staff-only order queue |
| `PATCH /api/admin/orders` | Audited order-request review and paid-order fulfilment transitions |
| `GET /api/admin/catalog` | Staff-only catalog queue plus available ERP products and categories |
| `POST /api/admin/catalog` | Add an active ERP product to e-commerce as an unpublished listing |
| `PATCH /api/admin/catalog/[productId]` | Update publication, category, category type, display order, or storefront-only field overrides |
| `DELETE /api/admin/catalog/[productId]` | Remove an e-commerce listing without changing its ERP product |
| `GET /api/admin/refunds` | Staff-only refund review queue |
| `/api/admin/orders/[orderNumber]/refunds` | Create and review refund requests; does not call a payment gateway |
| `/api/admin/support/tickets` | Staff-only ticket queue, replies, and status changes |
| `/api/support/tickets` | Submit support ticket; signed-in customers can list their own tickets |
| `POST /api/worker/notifications` | Authenticated worker endpoint for email/SMS outbox delivery |
| `GET /api/pincode` | Postal-location lookup via India Post |
| `GET /api/db-test`, `/api/db-tables`, `/api/db-app-tables` | Development diagnostics; return 404 in production |

The storefront product path applies publication and active-product checks. There are two catalog service paths in the repository; consolidate or clearly document their ownership before adding new catalog behavior, so filtering, publication, price, and stock rules cannot drift.

The staff console is `/admin` and is restricted on both page and API boundaries. It supports request review, eligible paid-order fulfilment transitions, catalog publication, refund review, and support replies. Marking a refund complete is a manual audited attestation with an external reference; no gateway transfer is initiated by this app.

## Required Paid-Order Workflow

Treat the browser as untrusted. The browser may submit product IDs, quantities, and customer input, but it must never decide the payable amount, payment status, stock availability, tax, or final order status.

Recommended order/payment flow:

1. Validate the request server-side: customer/address fields, product IDs, quantity limits, published status, current price, tax rules, shipping eligibility, and stock.
2. Calculate the full amount on the server. Store immutable product, SKU, price, tax, discount, shipping, address, and currency snapshots with the order.
3. In a database transaction, create a pending-payment order and reserve the required inventory atomically. The reservation must prevent concurrent checkouts from selling the same available stock.
4. Create a payment attempt with the chosen gateway from the server. Persist the provider order/reference ID and the amount/currency sent to the provider. Return only the public checkout data required by the browser.
5. Let the customer complete payment using the provider's approved checkout component. Never collect or store raw card details in this application.
6. Confirm payment only after validating the gateway's signed webhook on the server. Verify the event, amount, currency, provider order ID, and local order association. Do not trust a success redirect or client-supplied status.
7. Make webhook processing idempotent. Persist provider event IDs with a uniqueness constraint; repeated delivery must not duplicate confirmation, stock changes, emails, or ERP orders.
8. On verified success, atomically mark the payment paid, confirm the order, consume/convert the inventory reservation, and enqueue the ERP and notification work.
9. On failure, cancellation, or payment timeout, transition the order/payment consistently and release the reservation according to an explicit expiry policy.
10. Handle refunds and partial refunds through server-side gateway operations and auditable status transitions. Reconcile provider settlements against local payment records regularly.
11. Show a confirmation page using server-fetched order status. Provide customers a secure way to view their order without exposing other customers' records.

Define allowed state transitions before implementing routes. A possible starting model is:

| Domain | Example states |
| --- | --- |
| Order | `PENDING_PAYMENT`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `PAYMENT_FAILED`, `REFUND_PENDING`, `REFUNDED` |
| Payment attempt | `CREATED`, `PENDING`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `CANCELLED`, `REFUND_PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED` |
| Inventory reservation | `ACTIVE`, `CONSUMED`, `RELEASED`, `EXPIRED` |

These are design examples, not states fully implemented by the current app. Document which transitions are automatic, staff-controlled, or driven by a verified provider/carrier event.

## Payment Gateway Decision

Shortlist a gateway only after confirming the legal merchant entity, settlement bank account, business category, expected volume, customer payment methods, and B2B requirements. For an India-focused launch, compare Razorpay, Cashfree, and PayU against the current merchant account terms and official integration documentation. The repository currently has no payment gateway integration; no provider is configured or selected.

Ask each provider and the finance/operations team:

- Is the merchant account approved for this business and website? What KYC, domain, policy-page, and bank-account requirements apply?
- Which required methods are available: UPI, cards, net banking, wallets, payment links, or other methods? Are B2B bank transfers or credit terms handled outside online checkout?
- What are the current transaction fees, taxes on fees, settlement timing, reserves/holds, refund fees, dispute process, and support escalation path?
- Does the provider support server-created orders, signed webhooks, idempotency/retry behavior, refunds, partial refunds, and settlement reports needed by this project?
- What is the sandbox-to-production process, and who owns production credentials and reconciliation?

Gateway implementation requirements:

- Store private keys and webhook secrets only in the hosting provider's secret manager. Never expose them through `NEXT_PUBLIC_*`, source control, logs, or browser code.
- A public checkout key may be sent to the browser only when required by the provider. The server must create the payment request and verify the result.
- Verify webhook signatures using the exact raw request body and the provider's current documented algorithm. Reject invalid signatures and unexpected amounts/currencies.
- Use separate sandbox and production credentials. Test success, failure, timeout, duplicate webhook, out-of-order event, cancellation, refund, and provider outage cases.
- Store gateway IDs and event records, but never store card numbers, CVV, or other payment credentials.
- Keep local payment state and provider settlement state reconcilable; gateway capture and local DB commits are not one distributed transaction.

## Backend and Data Additions

Design and implement these before advertising the corresponding feature:

- **Authentication and authorization:** Google OAuth sessions, customer-owned order/ticket reads, and staff-email roles are implemented. Staff MFA is not enforced by the app; require it through the organization's Google Workspace policy.
- **Order/payment model:** Add payment attempts/provider references, webhook event deduplication, explicit order/payment state transitions, idempotency keys for checkout requests, and immutable financial snapshots.
- **Inventory:** Add reservation records with expiry and release/consume logic, transactional stock checks, and clear handling of multiple warehouses, ERP stock updates, backorders, and low-stock thresholds.
- **ERP integration:** Agree on the ERP as the source of truth for products, tax, stock, and confirmed sales. The current ERP module is read-only. Define an approved write API or integration service, retry policy, idempotency, reconciliation, and an outbox/queue for reliable order sync.
- **Tax and pricing:** Confirm GST treatment with the finance/tax owner, including seller location, place of supply, intra/inter-state split, GSTIN rules, HSN/SAC, taxable shipping/discounts, rounding, and invoice numbering. Current order API stores a single aggregate tax amount; this is not proof of production tax compliance.
- **Shipping and tracking:** Add delivery eligibility/rates, fulfilment and shipment records, carrier/consignment IDs, tracking events, delivery status, cancellation/return rules, and customer-facing tracking access. The project currently has PIN-code lookup but no implemented shipment-tracking backend.
- **Notifications:** The PostgreSQL outbox, retries/dead-letter handling, Resend email, and Twilio SMS worker are implemented. Configure providers and a scheduler. Payment-result events must wait for a verified gateway webhook.
- **Admin and audit:** Staff-only catalog publishing, order/request transitions, refund review, and customer support APIs are implemented with audit records and route-level role checks. Full paid-order operations depend on payment integration.
- **Support and policy:** Support ticket intake/replies and customer policy pages are implemented using the supplied rules. Carrier integrations, document uploads, and legal review remain external prerequisites.

Migration 004 adds `ecom_audit_log`, `ecom_notification_outbox`, `ecom_support_tickets`, `ecom_support_messages`, and `ecom_refund_requests`. Payment attempts/webhook events, inventory reservations, shipment records, and richer order transition history are still required for full paid checkout and carrier integration.

## Security and Privacy

- Require both `DATABASE_URL` and `ECOMMERCE_DATABASE_URL` with `sslmode=verify-full` for remote production databases. The database module rejects production connections that do not use certificate verification.
- Store secrets in the deployment platform's secret manager. Rotate any credential that may have entered logs, chat, commits, or screenshots.
- Apply least privilege separately to ERP reads, ecommerce writes, migrations, and staff/admin operations. Keep migration credentials out of the running web process where possible.
- Add hosting-level rate limiting and bot protection for checkout, authentication, PIN lookup, and other public endpoints. Validate request size and fields at the server boundary.
- Use secure, HttpOnly, SameSite cookies for sessions if cookie authentication is selected; protect state-changing requests against CSRF as appropriate. Add authorization checks to every customer/staff data route.
- Never log passwords, session tokens, full payment data, gateway secrets, or unnecessary customer addresses/phone numbers. Redact or minimize PII in errors and analytics.
- Define data retention, customer access/deletion processes, privacy notices, backup retention, and incident response with the business owner and legal/privacy adviser.
- Keep development database diagnostic endpoints disabled or removed from production. Do not expose stack traces, schema details, or internal IDs unnecessarily.
- Configure security headers, HTTPS, production error handling, dependency updates, and secret scanning in the chosen hosting and CI setup.

## Deployment Runbook

The app can run on a Node.js-compatible Next.js host. Choose a host only after confirming its Node.js/Next.js support, region, PostgreSQL connectivity, connection pooling, environment-secret support, logs, background-task needs, and rollback capabilities. Payment webhooks and future ERP/notification retries may require a durable queue or worker in addition to the web deployment.

### 1. Prepare environments

- Keep development, staging, and production databases and gateway accounts separate.
- Create a staging database from a sanitized copy or representative schema/data. Confirm required ERP tables and indexes exist.
- Confirm production domains, DNS, TLS certificate, region, data residency needs, allowed callback/webhook URLs, and operational owners.
- Choose a durable PostgreSQL provider with automated backups, point-in-time recovery if available, tested restore procedures, monitoring, and a supported TLS configuration.

### 2. Configure and migrate the database

- Review every SQL migration and verify its target database before applying it.
- Apply migrations to staging first, verify catalog and order behavior, then apply approved migrations to production through a controlled release process.
- Create separate least-privilege application and migration roles. Ensure ERP access remains read-only unless an approved integration is implemented.
- Publish only verified product mappings. Validate images, prices, GST data, units, availability, and customer-visible descriptions.
- Configure database connection pooling to suit the host. The app uses a `pg` pool; serverless deployments must account for connection limits and may require a provider pooler.

### 3. Configure environment secrets

At minimum, the current app needs:

| Variable | Purpose | Handling |
| --- | --- | --- |
| `DATABASE_URL` | Read-only ERP PostgreSQL connection | Secret; production remote DB must use `sslmode=verify-full` |
| `ECOMMERCE_DATABASE_URL` | Separate e-commerce PostgreSQL connection | Secret; production remote DB must use `sslmode=verify-full` |
| `AUTH_SECRET` | Auth.js session encryption | Secret; generate with `npx auth secret` |
| `AUTH_GOOGLE_ID` | Google OAuth web client ID | Server configuration |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret | Secret; server-only |
| `AUTH_STAFF_EMAILS` | Comma-separated exact emails allowed to read the staff order queue | Server-only; use verified organizational accounts with enforced MFA |
| `AUTH_TRUST_HOST` | Trust the production host/proxy when required | Set only according to the host's Auth.js deployment guidance |
| `NOTIFICATION_WORKER_TOKEN` | Bearer token for scheduled outbox processing | Secret; send only from the hosting scheduler |
| `RESEND_API_KEY` | Transactional email provider key | Secret; Resend |
| `NOTIFICATION_FROM_EMAIL` | Verified sender address | Server configuration |
| `NOTIFICATION_ORDERS_EMAIL` | Internal new-order-request notifications | Server configuration |
| `NOTIFICATION_SUPPORT_EMAIL` | Internal support-ticket/reply notifications | Server configuration |
| `TWILIO_ACCOUNT_SID` | SMS provider account | Server configuration |
| `TWILIO_AUTH_TOKEN` | SMS provider credential | Secret; Twilio |
| `TWILIO_FROM_NUMBER` | Approved sender number | Server configuration |
| `ORDER_REQUESTS_ENABLED` | Enables the existing pending-request endpoint in production | Does not activate payment or confirmed checkout |
| `DEV_STOREFRONT_PRODUCT_IDS` | Optional development-only product allowlist | Do not use as a production catalog control |
| `DEV_STOREFRONT_PRODUCT_SKUS` | Optional development-only SKU allowlist | Do not use as a production catalog control |

Payment, shipping, and ERP-write variables do not exist as configured integrations in the current project. Email/SMS variables are supported by the outbox worker but remain optional until configured. Mark secrets as server-only; only intentionally public browser keys may use a public environment variable.

Schedule an authenticated `POST /api/worker/notifications` from the hosting platform every minute (or the agreed interval). The worker claims jobs with `SKIP LOCKED`, retries with capped backoff, marks jobs `DEAD` after eight attempts, and recovers processing jobs stale for over ten minutes. Monitor the outbox and dead-letter jobs. Payment-result notifications must only be queued by a verified payment event; dispatch/delivery messages are queued by audited staff transitions for payment-confirmed orders.

### 4. Build and deploy

From the project root, run the checks before deploying:

```bash
npm run lint
npm test
npm run build
```

Deploy the built application using the selected host's supported Next.js process. Configure health checks, HTTPS, production environment variables, domain redirects, and webhook routes. Do not enable `ORDER_REQUESTS_ENABLED` as a substitute for a completed payment flow.

### 5. Stage and release safely

- Run end-to-end checkout tests in gateway sandbox and staging database first.
- Verify webhook signatures using the exact deployed URL and provider configuration.
- Confirm database backup and rollback procedures; use backward-compatible migrations when deployments may overlap.
- Deploy to production with payment/checkout disabled or restricted until smoke tests and finance reconciliation pass.
- Make a low-value controlled transaction, verify provider settlement reporting, local order/payment state, email, ERP sync, and refund path before opening sales broadly.
- Record deployment version, migration versions, gateway configuration owner, support contacts, and rollback steps.

## Testing and Acceptance Criteria

The test suite is organized into fast, isolated unit tests and real PostgreSQL integration tests.

### 1. Running Unit Tests

Unit tests require no external database credentials or network access and execute in milliseconds:

```bash
npm test
```

This runs 50 comprehensive tests across 7 test suites:
- `order-request-validation.test.ts`: Request parsing, byte-size limits, payload sanitization, and state validation.
- `ecommerce-database.test.ts`: Strict database connection safeguards, rejection of ERP URL targeting, and URL format verification.
- `razorpay-security.test.ts`: HMAC SHA-256 signature verification, timing attack resistance, webhook signature validation, server payment verification, authorization boundaries, and simulated payment guards.
- `order-fulfillment-lifecycle.test.ts`: Order fulfillment progression, staff-only transition gates, shipment creation/updates, and PAYMENT_REVIEW reconciliation.
- `order-concurrency-idempotency.test.ts`: Concurrent inventory race conditions, deterministic row locking, duplicate submission protection under identical Idempotency-Key, and request hash validation.
- `account-linking.test.ts`: Verified-email customer account linking, unverified session rejection, ownership reassignment protection, and idempotent linking.
- `razorpay-test-mode.test.ts`: Gateway test-mode credential handling, fail-closed validation, and sandbox probe safety.

### 2. Dedicated PostgreSQL Integration Testing

Genuine PostgreSQL integration tests run real SQL against an isolated, disposable database to verify migrations, constraints, atomicity, locking, and concurrency.

#### A. Provisioning the Test Database
To prevent accidental data pollution, the integration test runner requires a dedicated disposable database completely separate from both the ERP database (`DATABASE_URL`) and the development e-commerce database (`ECOMMERCE_DATABASE_URL`).

```bash
# Example: Create an isolated disposable database on local PostgreSQL
createdb -U postgres sourceasia_ecom_test
```

#### B. Required Environment Variable & Safety Guards
Set the `ECOMMERCE_TEST_DATABASE_URL` environment variable:

```powershell
# In PowerShell:
$env:ECOMMERCE_TEST_DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/sourceasia_ecom_test?sslmode=disable"
```

Safety guards enforced in `app/lib/test-database.ts`:
- Rejects missing or malformed URLs.
- Strictly fails if the test database URL matches `DATABASE_URL` (ERP database).
- Strictly fails if the test database URL matches `ECOMMERCE_DATABASE_URL` (development database).
- Requires the database name to contain `test` or `disposable` (e.g., `sourceasia_ecom_test`).
- Credentials and connection strings are never logged or exposed.
- If `ECOMMERCE_TEST_DATABASE_URL` is not set, integration tests safely bypass execution with a clear explanatory notice without failing.

#### C. Applying Migrations to the Test Database
Migrations `001` through `007` are automatically applied sequentially during `npm run test:integration`. Alternatively, apply them manually using `psql`:

```powershell
Get-ChildItem .\db\migrations\*.sql | Sort-Object Name | ForEach-Object {
  psql $env:ECOMMERCE_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f $_.FullName
}
```

#### D. Running Integration Tests
```bash
npm run test:integration
```
Or run both unit and integration suites together:
```bash
npm run test:all
```

Integration tests verify:
1. All migrations (`001`-`007`) apply cleanly in order.
2. Foreign keys, unique constraints (`ecom_order_idempotency_key_scope_unique`), and indexes exist.
3. Transaction commit and rollback leave no partial orders, items, or holds.
4. Two concurrent checkouts competing for the last unit serialize under row-level locks (`FOR UPDATE OF mapping`), preventing overselling.
5. Idempotency uniqueness prevents duplicate submissions from creating multiple orders.
6. Expired holds (past the 10-minute hold window) are excluded from active holds and properly released.
7. Unassigned guest orders link transactionally to verified customer accounts and never reassign orders owned by others.
8. Duplicate payment confirmation calls are idempotent and report `alreadyPaid: true` without duplicating state transitions.

### 3. Razorpay TEST-MODE Verification vs. Mocked Unit Tests

- **Mocked Unit Tests (`npm test`):**
  Validate signature algorithms (HMAC SHA-256), timingSafeEqual comparisons, payment field enforcement (exact paise amount, INR currency, captured status), and webhook idempotency using in-memory mock responses. No network calls or secrets are required.
- **Test-Mode Sandbox Verification (`RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`):**
  When valid Razorpay test keys (starting with `rzp_test_`) are supplied in the test environment, the probe validates credential formatting and gateway connectivity.
  - Fallback keys like `rzp_test_sourceasia_dev` are explicitly rejected as real credentials.
  - Live mode keys (`rzp_live_`) are strictly barred from tests.
  - Never creates real payments or modifies hosted dashboard webhooks during automated testing.

### 4. Client-Side Idempotency Key Handling

The checkout interface at `app/checkout/page.tsx` implements client-side idempotency protection:
- **Key Generation:** When the customer initiates checkout, a unique UUID (`crypto.randomUUID()`) is generated and retained in a React ref for the checkout attempt.
- **Header:** Sent as `Idempotency-Key: <key>` on `POST /api/orders`.
- **Retries:** If a network timeout or temporary failure occurs, retrying the submission sends the exact same key. The server detects the key under a transaction-scoped advisory lock (`pg_advisory_xact_lock`), returns the existing order result, and creates no duplicates.
- **Key Clearing:** Upon a successful response, the key is cleared so subsequent independent checkouts generate fresh keys.
- **Material Changes:** If the same key is reused with a different cart or customer payload, the server strictly returns `409 Conflict`.

## Monitoring, Support, and Recovery

Set up monitoring before real customers can pay:

- Application: availability, latency, error rate, failed checkout starts, and route-level failures.
- Database: connection exhaustion, slow queries, locks, storage, replication/backup health, and failed migrations.
- Payments: webhook failures/lag, pending payments beyond timeout, provider/local mismatches, refunds, chargebacks, and settlement differences.
- Operations: inventory reservation age, ERP sync backlog, unsent notifications, shipment exceptions, and order status stuck beyond defined service targets.
- Security: repeated login/checkout failures, rate-limit triggers, suspicious admin actions, secret access, and dependency alerts.

Create alerts with named owners and a runbook. Keep logs structured and redact PII. Define support procedures for payment received but order not confirmed, duplicate payment, stock discrepancy, refund delay, failed shipment, database outage, and suspected credential exposure. Test database restores and payment/ERP reconciliation rather than assuming they work.

## Decisions for the Project Team

Record answers and owners for these questions before implementation is considered complete:

1. Which payment gateway and merchant account will be used? Who owns KYC, production credentials, webhook configuration, settlements, refunds, disputes, and reconciliation?
2. Which payment methods and B2B terms are supported: online payment only, UPI/cards/net banking, bank transfer, payment links, purchase orders, or approved credit?
3. Is payment captured immediately or authorized then captured? When does the order become confirmed, and what happens when payment is pending or delayed?
4. What stock is sellable, which warehouses count, when is it reserved, how long is a hold, and how are ERP changes/backorders handled?
5. Is the ERP the authoritative source for product, price, tax, stock, and sales orders? What supported API or integration writes confirmed orders back to it?
6. Who approves product publication, prices, tax data, discounts, shipping charges, and catalog changes?
7. Which tax rules, invoice requirements, seller details, and place-of-supply decisions have been approved by the finance/tax owner?
8. Which carriers, shipping zones/rates, service levels, return/refund rules, and tracking experience are required?
9. Are guest checkout and customer accounts both required? Which identity/session provider and staff roles will be used?
10. Which deployment host, database provider/region, queue/worker, email/SMS providers, uptime targets, support hours, and incident owners are approved?
11. What customer information is collected, who can access it, how long is it retained, and how are privacy requests handled?

## Go-Live Checklist

- [ ] Payment, order, inventory, tax, ERP, shipping, and refund designs are approved and have named owners.
- [ ] Real authentication and role-based authorization are implemented and tested; demo account UI is not used as security.
- [ ] Server-side payment creation, signed/idempotent webhooks, payment reconciliation, and refund workflows are implemented.
- [ ] Atomic stock reservation/release and ERP integration behavior are implemented and tested under concurrent requests.
- [ ] Tax, price, shipping, and invoice behavior is approved by the responsible business/finance owner.
- [ ] Customer order history, admin/order processing, notifications, and shipment tracking are implemented or explicitly excluded from launch scope.
- [ ] Production database roles, TLS, backups, restore test, migrations, rate limiting, bot controls, secret management, and monitoring are ready.
- [ ] Terms, privacy, shipping, cancellation, return/refund, contact, and payment pages are accurate and published.
- [ ] Staging tests pass for success, failure, retries, duplicate webhooks, refunds, ERP/carrier failures, and recovery procedures.
- [ ] Production smoke test, payment settlement check, support runbook, rollback plan, and launch approval are complete.

## Contributing

Keep credentials and local environment files out of source control. For backend or database changes, update tests, migrations, API contracts, and this README together. Never change ERP data or production payment/order state manually without an approved, auditable procedure.

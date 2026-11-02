# Source Asia E-Commerce

An industrial e-commerce application for browsing supplies, checking INR pricing and stock availability, and placing business orders. Built with Next.js, React, TypeScript and PostgreSQL.

> **Status: pre-launch.** Application features and local checks do not establish production readiness. A production host, final store domain and live-service activation have not been independently verified. The release checklist below records the remaining work.

## Technology

| Component | Repository version / requirement |
| --- | --- |
| Next.js | 16.4.3, including the upstream security upgrade |
| React / React DOM | 19.2.8 |
| TypeScript | 5.x; exact version is recorded in `package-lock.json` |
| Styling | Tailwind CSS 4 and application stylesheets |
| Authentication | Auth.js / NextAuth 5 beta with Google OAuth |
| Database client | `pg` 8.x |
| Client state | Zustand 5 |
| Node.js | At least 20.9.0, as required by the locked Next.js package; standardize an actively supported version across development, CI and hosting |

The lockfile is the dependency source of truth. Use `npm ci` for a fresh installation. The repository does not currently pin a Node.js or npm version through `engines` / `packageManager`.

## Application features

- Product listing with search, category/subcategory filters, price and availability filters, sorting, wishlist controls and stock-aware cart actions.
- A page-scoped ivory, beige, sage and forest-green listing design, with larger product imagery and responsive three-, two- and one-column layouts.
- Product details, local cart state, checkout and account order/address management.
- Google sign-in, verified-email sessions and staff-only administration.
- Order requests, inventory reservations, idempotency controls and order/shipment tracking.
- Razorpay checkout, server-side payment verification and webhook handling.
- Bank-transfer submission and staff verification flows.
- Support tickets, a notification outbox and an authenticated notification-worker endpoint.

Provider credentials, database provisioning and deployed acceptance checks are still required. Implemented integration code is not evidence of live payment acceptance or notification delivery.

## Architecture and database boundaries

The application uses three distinct database connections:

| Connection | Purpose |
| --- | --- |
| `DATABASE_URL` | ERP product, pricing and inventory reads |
| `ECOMMERCE_DATABASE_URL` | Website catalog mappings, accounts, carts, orders, reservations, support, payments and notification records |
| `ECOMMERCE_TEST_DATABASE_URL` | Dedicated database-backed integration tests |

ERP and e-commerce databases must remain separate. ERP data is the upstream source; website-specific catalog overrides and transactional records belong in the e-commerce database. The dedicated test connection must never fall back to either application database.

Database pools are created lazily. The store page and product metadata call database-backed helpers at request time; this application requires a running Next.js backend.

A previous local audit found that the ERP and e-commerce connections used the same login/password despite different database names. Their database owner must coordinate any rotation with every application using that login. Prefer separate least-privilege application roles. No database usernames, passwords or connection strings belong in this repository.

## Project structure

```text
app/
  api/                    Authentication, account, catalog, checkout and admin APIs
  components/             Shared site, product, cart and UI components
  lib/                    Database and business-service modules
  store/
    storefront.tsx        Product listing client and existing interactions
    products-listing.css  Styles scoped to the listing and its filter drawer
  checkout/               Checkout experience
  payment/                Payment experience
  track/                  Order/shipment tracking
  globals.css             Existing shared styling
  layout.tsx              Root layout and Google Fonts

db/migrations/            Versioned SQL migrations
scripts/                  Maintenance, data-audit and test helpers
types/                    Application type declarations
public/                   Static assets
```

## Local development

1. Install a Node.js version compatible with the locked dependencies and npm.
2. Clone the repository and install dependencies:

   ```sh
   git clone https://github.com/Source-Asia-Lab/ecom-website.git
   cd ecom-website
   npm ci
   ```

3. Ask the database owner for approved development connections. Arrange local configuration privately using the environment template; preserve any existing local configuration rather than overwriting it.
4. Have the database owner confirm that the development e-commerce schema is ready. Do not run migration or diagnostic scripts against ERP or production.
5. Start the development server:

   ```sh
   npm run dev
   ```

   Open the local URL printed by Next.js. Register that exact host/port in the development Google OAuth callback configuration when sign-in is needed.

Next.js automatically loads local environment files. An ordinary development or build command can therefore consume credentials already present on the machine. Use approved development configuration and keep secrets outside synced working folders where possible.

## Environment configuration

Configure values through an approved secret-management workflow. This table intentionally contains variable names and purposes only.

| Variables | Needed for |
| --- | --- |
| `DATABASE_URL`, `ECOMMERCE_DATABASE_URL` | Separate ERP and e-commerce runtime connections |
| `ECOMMERCE_TEST_DATABASE_URL` | Dedicated database-backed tests only |
| `AUTH_SECRET` | Auth.js session protection |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth client configuration |
| `AUTH_URL` | Canonical application URL / callback configuration |
| `AUTH_TRUST_HOST` | Explicit trust configuration on the approved application host |
| `AUTH_STAFF_EMAILS` | Staff account allowlist |
| `ORDER_REQUESTS_ENABLED` | Production order-acceptance gate |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Gateway orders, verification and signed webhooks |
| `ENABLE_PAYMENT_SIMULATION` | Explicit development/test simulation; do not enable for production acceptance |
| `BANK_TRANSFER_ACCOUNT_NAME`, `BANK_TRANSFER_ACCOUNT_NUMBER`, `BANK_TRANSFER_IFSC`, `BANK_TRANSFER_BANK_NAME`, `BANK_TRANSFER_BRANCH` | Bank-transfer instructions, if offered |
| `BANK_TRANSFER_WEBHOOK_SECRET` | Bank-transfer verification integration, if used |
| `NOTIFICATION_WORKER_TOKEN` | Authorization for the external notification-worker caller |
| `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` | Transactional email provider and verified sender |
| `NOTIFICATION_ORDERS_EMAIL`, `NOTIFICATION_SUPPORT_EMAIL` | Monitored team recipient inboxes |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Optional SMS delivery |

Keep all credentials server-side. Do not put secrets in `NEXT_PUBLIC_*` variables, screenshots, logs, commits or issue descriptions. Remote production database connections require verified TLS. Local configuration does not automatically configure a hosting provider.

Google OAuth uses `/api/auth/callback/google`; register it under each approved application hostname. The client ID, client secret and callback must belong to the same intended environment. Verify both customer access and staff authorization before launch.

## Available commands

| Command | Purpose / boundary |
| --- | --- |
| `npm run dev` | Start the local Next.js server using local runtime configuration |
| `npm run lint` | ESLint checks |
| `npm test` | The configured unit/safety tests; review environment-dependent skips |
| `npm run test:db:preflight` | Connect to and verify the dedicated test database; not an offline check |
| `npm run test:integration` | Database-backed tests; requires the dedicated test identity and may reset test data / apply test migrations |
| `npm run test:all` | Unit tests followed by database-backed integration tests |
| `npm run build` | Production compilation and prerendering; use the isolation precautions below |
| `npm run start` | Start a previously built application with approved runtime configuration |

Only run database-backed commands with explicit authorization and verified test isolation. The test helper enforces a fixed dedicated test identity, TLS and comparison checks against the ERP/e-commerce database identities.

`scripts/apply-ecom-migrations.ts` is a limited migration helper, not a complete fresh-database bootstrap. Have the database owner reconcile the existing schema against all files in `db/migrations/` before applying changes. Never point maintenance scripts at ERP without a separately reviewed, explicitly authorized purpose.

## Production-build verification

A production build has **not** been completed as part of this listing UI update. The UI checks do not replace a production build or deployed service checks.

Use a disposable sanitized working-tree snapshot for verification. Include required modified/untracked source and assets, but exclude all environment files, credentials, original Git metadata, dependencies, old build output, logs and database backups. Do not use an archive of the last commit when testing additional uncommitted work: it will omit those changes.

The builder must have no production credentials, no attached cloud identity and no route to ERP, production or test databases. Leave all database URL variables unset. Retain normal production security checks; do not patch the environment loader, disable TLS checks, add database mocks or enable development fixtures to obtain a passing build.

Use an administrator-verified default-deny network policy:

- Dependency installation: approved HTTPS access to `registry.npmjs.org`.
- Build: approved HTTPS access to `fonts.googleapis.com` and `fonts.gstatic.com` for Geist / Geist Mono.
- Both phases: controlled DNS; deny other internet destinations, private networks, database endpoints, cloud metadata, host services and unapproved proxies.

A standard Docker network or a proxy environment variable alone is insufficient. Pin the builder image by digest, verify source hashes before/after, and review runtime JSON/static-asset packaging. A fully offline fresh build can fail because Google Fonts are downloaded at build time.

## Verification of the listing UI change

- ESLint and TypeScript checks passed in the development working tree.
- Isolated browser checks passed at nine widths from 320 to 1440 pixels, with no listing horizontal overflow.
- Search, sorting, availability filters, wishlist, cart actions, disabled stock states, mobile filters and sidebar scrolling were checked using fixtures.
- Styles are scoped to the listing and its filter drawer. Header, footer and shared-card styling outside the listing were checked for preservation.
- No production database, payment-provider or notification-provider acceptance test was performed.

## Remaining work before launch

- [ ] **Approve application hosting.** Confirm a company-owned Next.js/Node.js host and its project/account access. The previously reported GitHub Pages choice cannot execute this backend; its published usage limits also exclude e-commerce hosting. See [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
- [ ] **Confirm production and staging domains.** Record stable HTTPS addresses, authoritative DNS ownership, TLS and environment-specific callback URLs. No e-commerce production/staging hostname has been independently verified.
- [ ] **Provide the isolated build runner.** An approved running Linux environment, a digest-pinned Node builder and independently verified egress policies are still needed before installation/build execution.
- [ ] **Finalize release inputs and run the production build.** Review and publish remaining intended local work separately, reproduce the build from complete inputs and confirm public assets/runtime data are packaged.
- [ ] **Complete the credential rotation plan.** Inventory hosting, CI and scheduler consumers; coordinate shared database-login dependencies; configure replacements privately through approved owners.
- [ ] **Configure and verify hosted databases.** Confirm separate databases, least-privilege roles, schema/migration status, verified TLS and restricted hosting network access.
- [ ] **Activate production authentication.** Configure Google OAuth and staff access, then verify login, sign-out and rejection of unauthorized staff access.
- [ ] **Activate email and scheduling.** Verify the Resend sender domain, monitored recipients, controlled delivery, worker authorization, queue processing and scheduler ownership. SMS remains optional.
- [ ] **Apply hosting protection.** Review rate limits, bot protection and narrow callback/webhook exceptions for the selected host.
- [ ] **Confirm the merchant account and payments.** Verify Razorpay ownership, controlled test flows, capture/verification, duplicate webhook handling and production webhook configuration. Verify bank instructions if bank transfer is offered.
- [ ] **Complete deployed acceptance checks.** Cover browsing, mobile behavior, stock/reservations, cart restoration, checkout, tracking, support, staff operations and notification delivery.
- [ ] **Record business approval and enable orders.** Confirm the approver/date, pricing/tax/invoice requirements, policies and monitored contacts before enabling production order acceptance.

Additional local work is intentionally outside this listing UI commit: cart-hydration refinements, gallery/content helpers and catalog assets, authentication/checkout refinements, the cron adapter and worker improvements, further tests and deployment documentation/infrastructure. Those changes must be reviewed and published as separate, complete changes before relying on them in a release. A future cron adapter uses a separate `CRON_SECRET`; no cron deployment is established by this UI update.

A configured or passing build does not prove that the application is deployed or that live services are active.

# Source Asia E-Commerce

**Source Asia** is an online store (e-commerce website) for buying industrial supplies, electrical components, tools, adhesives, packaging materials, and office stationery in India.

Customers can browse products by category, add items to a cart and wishlist, place orders with real-time stock availability, pay online securely through **Razorpay** (UPI, cards, netbanking), and track their delivery status live.

- **Repository:** [github.com/Source-Asia-Lab/ecom-website](https://github.com/Source-Asia-Lab/ecom-website)
- **Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, PostgreSQL, Zustand, Razorpay, Auth.js (Google sign-in)

---

## How the website works

| Area                                   | What it does                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Storefront** (`/store`)              | Browse categories and products, product details, cart, wishlist, PIN-code delivery check, support and policy pages (`/shipping`, `/payment`, `/returns-refunds`, `/privacy`, `/terms`). |
| **Checkout** (`/checkout`)             | Server-validated address and quantities, GST calculation, 10-minute stock reservation while paying.                                                                                     |
| **Payments**                           | Razorpay gateway — order creation, signature verification, signed webhooks, idempotent confirmation. Local dev can simulate payment without keys.                                       |
| **Order tracking** (`/track/ECOM-...`) | Public page showing live order status, delivery steps, carrier, and AWB tracking number.                                                                                                |
| **Accounts**                           | Google sign-in, saved addresses, and order history. Guest orders are securely linked to an account on sign-in.                                                                          |
| **Staff admin** (`/admin`)             | Staff-only console to review orders, fulfil and ship them, publish products to the storefront, handle refunds, and reply to support tickets.                                            |
| **Notifications**                      | Email (Resend) and optional SMS (Twilio) via a scheduled outbox worker.                                                                                                                 |

### Two databases

The app talks to **two separate PostgreSQL databases**:

```text
┌─────────────────┐    read-only     ┌──────────────────┐
│   Next.js app   │ ───────────────► │  ERP PostgreSQL  │
│                 │                  │ products, stock  │
└────────┬────────┘                  └──────────────────┘
         │ read/write
         ▼
┌──────────────────┐
│ E-commerce DB    │  orders, catalog, payments,
│                  │  reservations, support, outbox
└──────────────────┘
         ▲
         │ webhooks / scheduled worker
┌────────┴─────────┐
│ Razorpay, Resend │
│ Twilio (optional)│
└──────────────────┘
```

Product and stock data always come from the ERP database; the website never modifies ERP data. Orders and payments live in their own e-commerce database.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values, see below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable                                  | Required      | Purpose                                            |
| ----------------------------------------- | ------------- | -------------------------------------------------- |
| `DATABASE_URL`                            | Yes           | Read-only ERP PostgreSQL connection                |
| `ECOMMERCE_DATABASE_URL`                  | Yes           | E-commerce PostgreSQL connection                   |
| `AUTH_SECRET`                             | Sign-in       | Auth.js encryption secret                          |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`   | Sign-in       | Google OAuth credentials                           |
| `AUTH_STAFF_EMAILS`                       | Admin         | Comma-separated staff emails allowed into `/admin` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live checkout | Razorpay API keys (server only)                    |
| `RAZORPAY_WEBHOOK_SECRET`                 | Live checkout | Webhook signature verification                     |
| `ORDER_REQUESTS_ENABLED`                  | Production    | Must be `true` to accept real orders               |
| `NOTIFICATION_WORKER_TOKEN`               | Email/SMS     | Bearer token for the notification worker           |
| `RESEND_API_KEY`, `TWILIO_*`              | Optional      | Email / SMS delivery                               |

> Remote databases must use `sslmode=verify-full` — enforced by the app in production.

### Database migrations

Apply **only** to the e-commerce database (never the ERP):

```powershell
Get-ChildItem .\db\migrations\*.sql | Sort-Object Name | ForEach-Object {
  psql $env:ECOMMERCE_DATABASE_URL -v ON_ERROR_STOP=1 -f $_.FullName
}
```

### npm scripts

| Command         | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `npm run dev`   | Development server                              |
| `npm run lint`  | ESLint (currently clean — 0 errors, 0 warnings) |
| `npm test`      | Unit tests, no database needed                  |
| `npm run build` | Production build                                |
| `npm run start` | Serve the production build                      |

---

## Key API routes

| Method    | Path                                                  | Description                         |
| --------- | ----------------------------------------------------- | ----------------------------------- |
| GET       | `/api/ecommerce/categories`, `/api/ecommerce/catalog` | Published categories and products   |
| POST      | `/api/orders`                                         | Create a pending order + stock hold |
| POST      | `/api/checkout/razorpay/order` / `.../verify`         | Start / verify payment              |
| POST      | `/api/webhooks/razorpay`                              | Razorpay webhook (signed)           |
| GET       | `/api/orders/[orderNumber]/track`                     | Public order tracking               |
| GET/PATCH | `/api/account/profile`, `/api/account/addresses`      | Customer account                    |
| GET/PATCH | `/api/admin/orders`                                   | Staff fulfilment queue              |

---

## Testing

```bash
npm test        # 63 passing tests — payments, orders, concurrency, security
```

Integration tests against a disposable PostgreSQL database are available via `npm run test:integration` (set `ECOMMERCE_TEST_DATABASE_URL` first; the DB name must contain `test` or `disposable`).

---

## What's left to do before / after launch

Code, database, and security work is **done and verified**. The remaining items need business input, credentials, or decisions:

- [ ] **Add Razorpay live keys** (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) and register the production webhook URL.
- [ ] **Add Google OAuth credentials** (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`) for customer sign-in.
- [ ] **Add staff emails** to `AUTH_STAFF_EMAILS` so the team can access `/admin`.
- [ ] **Set `ORDER_REQUESTS_ENABLED=true`** on the host when ready to accept real orders.
- [ ] **Configure email/SMS** — Resend API key, verified sender, and schedule the notification worker (`POST /api/worker/notifications`).
- [ ] **Enable rate limiting / bot protection** on the hosting platform for checkout and admin routes.
- [ ] **Finance sign-off** on GST treatment, invoices, and displayed policy pages.
- [ ] **Optional later:** automatic Razorpay refunds, downloadable GST invoices, ERP sales-order write-back, carrier API integration, persistent server-side cart.

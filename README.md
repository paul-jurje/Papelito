# Papelito

A TypeScript full-stack writing app: a responsive Vite + React marketing site
that converts visitors into paying subscribers, and an authenticated rich-text
document workspace backed by an Express API, SQLite database, Passport
sessions, and Stripe test-mode subscriptions.

Visitors can register, complete a Stripe Checkout (test mode), and land in a
Tiptap-powered editor — all in one coherent flow. Document create / edit /
delete / save is gated by an active subscription that is confirmed
**server-side** via the Stripe webhook.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite, React, React Router, Tailwind CSS, Tiptap (MIT core) |
| Editor | Tiptap + ProseMirror (JSON content stored in the DB) |
| Backend | Node.js, Express, Passport (local strategy), `express-session` |
| Database | SQLite via `better-sqlite3` + Drizzle ORM |
| Sessions | `connect-sqlite3` (sessions persisted to the same SQLite DB) |
| Payments | Stripe Checkout (test mode) + webhook for server-side gating |
| Auth | Email + password, hashed with `bcrypt` |
| Tooling | pnpm workspaces, TypeScript everywhere, Vitest, ESLint/Prettier |

## Architecture

The backend is layered so each layer has a single responsibility:

```
HTTP request
    │
    ▼
Routes          ← express Router, request validation, status codes
    │
    ▼
Services        ← business rules (authorization, ownership, idempotency)
    │
    ▼
Repositories    ← SQL access (Drizzle ORM); one module per entity
    │
    ▼
Database        ← SQLite file (default: papelito.db) + migrations
```

- `apps/api/src/routes/` — HTTP handlers, mounted under `/api/*`.
- `apps/api/src/services/` — orchestration: auth, billing, documents.
- `apps/api/src/repositories/` — `userRepository`, `documentRepository`,
  `subscriptionRepository`.
- `apps/api/src/db/` — Drizzle schema + migrations + the lazy DB singleton.
- `apps/api/src/middleware/` — `requireAuth`, `requireSubscription`.

The frontend (Vite SPA) talks to the API exclusively over JSON.

## Project Layout

```
.
├── apps/
│   ├── api/                  # Express + Drizzle + Passport + Stripe
│   └── web/                  # Vite + React + Tiptap
├── docs/
│   └── plan.md               # The original implementation plan
├── .env.example
├── package.json              # pnpm workspaces root
└── pnpm-workspace.yaml
```

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (the repo pins `pnpm@9.15.9` via `packageManager`)
- **Stripe CLI** (optional but recommended) — for forwarding webhooks to
  your local dev server. Install from
  <https://stripe.com/docs/stripe-cli>.

## Install

From the repository root:

```bash
pnpm install
```

This installs both apps in one pass (pnpm workspaces).

## Configure Environment

Copy the example env file and edit the values:

```bash
cp .env.example .env
```

The API refuses to start without `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
and `STRIPE_PRICE_ID`. See [Environment Variables](#environment-variables)
below for the full list and what each one does.

## Run Database Migrations

Migrations create the `users`, `documents`, `subscriptions`, and
`connect-sqlite3` session tables in the local SQLite file:

```bash
pnpm db:migrate
```

If you ever need to wipe local data, delete `apps/api/papelito.db` and
re-run the migration.

## Run (Development)

```bash
pnpm dev
```

This concurrently starts:

- the Express API on `http://localhost:3000`
- the Vite dev server on `http://localhost:5173`

Visit `http://localhost:5173` for the marketing site. Once registered and
subscribed (see below), the editor lives at `/editor`.

## Test

```bash
pnpm test
```

Runs every Vitest suite across both apps. To run just one side:

```bash
pnpm --filter api test
pnpm --filter web test
```

To typecheck without emitting:

```bash
pnpm typecheck
```

## Stripe Setup (Test Mode)

This project is wired for Stripe **test mode only** — never paste a live
secret key into `.env`.

### 1. Get a test secret key

From the [Stripe dashboard](https://dashboard.stripe.com/test/apikeys), copy
your `sk_test_...` secret key into `.env`:

```
STRIPE_SECRET_KEY=sk_test_...
```

### 2. Create the subscription price

1. Open the Stripe dashboard → **Products** → **Add product**.
2. Give it a name (e.g. "Papelito Monthly") and a description.
3. Set **Pricing model** = **Recurring**, **Price** = `$9` USD (or whatever
   you'd like), **Billing period** = **Monthly**.
4. Save the product and copy the new Price's id — it looks like
   `price_1ABCdef...`.
5. Paste it into `.env`:

```
STRIPE_PRICE_ID=price_1ABCdef...
```

The `POST /api/billing/checkout-session` endpoint uses this id to build the
Checkout Session's line item.

### 3. Forward webhooks to your local server

Stripe needs to call your local webhook endpoint to confirm payment
server-side. The Stripe CLI does this without exposing your machine to the
internet:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

On startup the CLI prints a `whsec_...` **webhook signing secret**. Paste
it into `.env` as `STRIPE_WEBHOOK_SECRET` and restart the API:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 4. Pay with a test card

Use Stripe's standard test card at Checkout:

```
4242 4242 4242 4242
```

Any future expiry date and any 3-digit CVC work. Stripe will then POST a
`checkout.session.completed` event to your local webhook, the API will
upgrade your user to an active subscriber, and the editor will unlock on
the `/checkout-return?success=true` page.

## Environment Variables

All variables live in `.env` at the repo root (loaded by `dotenv` in
`apps/api/src/db/index.ts`).

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | No | `papelito.db` | SQLite file path (relative paths resolve against `apps/api/`). |
| `SESSION_SECRET` | No | `dev-secret-do-not-use-in-prod` | Signs the session cookie. Set to a long random string in production. |
| `STRIPE_SECRET_KEY` | **Yes** | — | Stripe test-mode secret key (`sk_test_...`). The API refuses to start without it. |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | — | Webhook signing secret (`whsec_...`). Used to verify the HMAC signature Stripe sends on every webhook delivery. |
| `STRIPE_PRICE_ID` | **Yes** | — | Stripe Price id (`price_...`) for the monthly subscription. Used as the line item in Checkout. |
| `PORT` | No | `3000` | Port the Express API binds to. |
| `WEB_ORIGIN` | No | `http://localhost:5173` | Origin of the frontend web app. Used to configure CORS so the browser will send the session cookie on cross-origin requests. In production, set this to the deployed frontend URL (e.g. `https://app.example.com`). |

In tests, `NODE_ENV=test` is set by `apps/api/src/test/setup.ts`, which also
seeds placeholder Stripe env vars so the SDK constructor doesn't throw at
module load. The integration test in
`apps/api/src/tests/integration/documents.integration.test.ts` further mocks
the Stripe SDK so no real network calls are made.

## How Subscription Gating Works

1. The user clicks **Subscribe** on the marketing site (or the upsell page
   in the editor when not subscribed).
2. The frontend calls `POST /api/billing/checkout-session` with the session
   cookie.
3. The API creates a Stripe Customer (or reuses an existing one) and a
   Stripe Checkout Session in `subscription` mode, returning the URL.
4. The frontend redirects to Stripe Checkout. The user pays with the test
   card `4242 4242 4242 4242`.
5. Stripe redirects back to `/checkout-return?success=true&session_id=...`.
6. **Server-side**, Stripe POSTs `checkout.session.completed` to
   `/api/billing/webhook`. The handler:
   - verifies the HMAC signature with `STRIPE_WEBHOOK_SECRET`,
   - retrieves the live subscription to pick up the authoritative status
     and `current_period_end`,
   - upserts the row in the `subscriptions` table,
   - responds `200 { received: true }`.
7. The `/checkout-return` page refetches `/api/auth/me`, which now reports
   `isSubscriber: true`, and navigates the user into the editor.
8. The editor's `POST /api/documents`, `GET /api/documents`, etc. are gated
   by `requireSubscription`, which checks the `subscriptions` table on
   every request.

## License Notes

All libraries used in this project are permissively licensed and safe for a
paid product:

- Tiptap core is **MIT** — we intentionally do not include any Tiptap Pro
  extensions.
- CKEditor and TinyMCE are deliberately **not** used (copyleft / commercial
  dual license).

See `docs/plan.md` for the full license review.

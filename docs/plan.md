# Papelito Implementation Plan

## Goal

Build Papelito, a TypeScript full-stack web app: a responsive Vite React marketing site that converts visitors into paying subscribers, and an authenticated rich-text document workspace backed by an Express API, SQLite database, Passport sessions, and Stripe test-mode subscriptions.

## Constraints

- **TypeScript everywhere** — frontend and backend. No plain JavaScript.
- **Separate frontend/backend** — Vite SPA (React) on one port, Express API on another.
- **SQLite** for local development and production data (Drizzle ORM + `better-sqlite3` driver).
- **Server-validated sessions** — `Passport.js` + `express-session` with SQLite session store; protected routes always verify the session server-side.
- **Stripe test mode only** — subscription gating is confirmed via server-side webhook, never only by client redirect.
- **Subscriber-only editor** — document create/edit/delete/save is gated by active subscription.
- **License-compatible editor** — Tiptap core is MIT-licensed and safe for a paid product; we avoid copyleft dual-licensed editors (CKEditor, TinyMCE).
- **Layered backend** — Routes → Services → Repositories → Database.
- **No new runtime infrastructure** — local-first; deploy instructions are out of scope unless requested later.

## Completion Criteria

The implementation is considered complete when all of the following are true.

### Marketing & Conversion

- Landing page renders with headline, subhead, 2–3 benefit bullets, primary CTA, pricing section, and trust elements (FAQ/feature list).
- Layout is responsive on mobile and desktop.
- A visitor can register, complete Stripe Checkout (test mode), and land in the editor in one coherent flow.

### Authentication

- Users can register and log in/out with email/password.
- Sessions are server-validated via Passport.js + express-session stored in SQLite.
- UI shows distinct states for: logged out, logged in (non-subscriber), logged in (subscriber).

### Documents (Subscribers Only)

- Subscribers can create, edit (Tiptap WYSIWYG), save (auto or manual), rename, and delete documents.
- Documents persist to SQLite on the backend.
- Document list shows titles and last-updated times with empty states and error handling.
- Non-subscribers cannot create/edit documents.

### Stripe Payments

- Monthly subscription plan exists in Stripe test mode.
- Checkout uses Stripe Checkout Session or Payment Element.
- Webhook confirms payment server-side before granting subscriber access.
- Subscription status is queryable (e.g., for gating the editor).

## Chunks

### Chunk 1 — Monorepo Scaffolding & Tooling

**Status:** COMPLETED

**Scope:** Initialize a pnpm workspaces monorepo with shared TypeScript, ESLint/Prettier, Vite React frontend, and Express backend.

**Files Changed:**

- `package.json` (root, workspaces)
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/tsconfig.json`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/index.ts`
- `tailwind.config.js`, `postcss.config.js`, `apps/web/src/index.css`

**Depends On:** None.

**Accept When:**

- `pnpm install` succeeds in root.
- `pnpm dev` starts both Vite dev server and Express API concurrently.
- Frontend renders a “Hello Papelito” page and can call a `/api/health` endpoint that returns `200`.

**Test Coverage:**

- `apps/api/src/index.test.ts` — health endpoint returns `{ status: "ok" }`.

---

### Chunk 2 — Database Schema & Repository Layer

**Status:** COMPLETED

**Scope:** Define SQLite schema with Drizzle ORM and implement repository functions for users, sessions, subscriptions, and documents.

**Files Changed:**

- `apps/api/src/db/schema.ts`
- `apps/api/src/db/index.ts`
- `apps/api/src/db/migrate.ts`
- `apps/api/src/repositories/userRepository.ts`
- `apps/api/src/repositories/documentRepository.ts`
- `apps/api/src/repositories/subscriptionRepository.ts`
- `apps/api/src/types/index.ts`

**Depends On:** Chunk 1.

**Accept When:**

- Migrations create `users`, `documents`, and `subscriptions` tables.
- Repository functions pass unit tests for create/read/update/delete of each entity.
- Document content is stored as ProseMirror JSON text; title defaults to “Untitled document”.

**Test Coverage:**

- `apps/api/src/repositories/*.test.ts`

---

### Chunk 3 — Authentication Backend (complex)

**Status:** COMPLETED

**Scope:** Email/password registration, login, logout, and session management with Passport local strategy, bcrypt, and express-session stored in SQLite.

**Files Changed:**

- `apps/api/src/lib/passport.ts`
- `apps/api/src/lib/password.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/services/authService.ts`
- `apps/api/src/middleware/requireAuth.ts`
- `apps/api/src/types/express.ts`

**Depends On:** Chunk 2.

**Accept When:**

- `POST /api/auth/register` creates a user, hashes password, and logs them in.
- `POST /api/auth/login` validates credentials and creates session.
- `POST /api/auth/logout` destroys session.
- `GET /api/auth/me` returns the current user or `401`.
- Passwords are never returned in API responses.
- Tests cover duplicate email, wrong password, and unauthenticated access.

**Test Coverage:**

- `apps/api/src/routes/auth.test.ts`
- `apps/api/src/services/authService.test.ts`

---

### Chunk 4 — Marketing Site Frontend

**Status:** COMPLETED

**Scope:** Responsive landing page with value proposition, benefit bullets, primary CTA, pricing section, FAQ, and trust elements.

**Files Changed:**

- `apps/web/src/pages/LandingPage.tsx`
- `apps/web/src/components/Header.tsx`
- `apps/web/src/components/HeroSection.tsx`
- `apps/web/src/components/BenefitsSection.tsx`
- `apps/web/src/components/PricingSection.tsx`
- `apps/web/src/components/FAQSection.tsx`
- `apps/web/src/components/Footer.tsx`
- `apps/web/src/App.tsx`

**Depends On:** Chunk 1.

**Accept When:**

- Landing page renders headline, subhead, 3 benefit bullets, pricing card with CTA, and FAQ.
- Layout adapts to mobile (< 768 px) and desktop using Tailwind.
- “Subscribe” CTA navigates to `/register?next=subscribe`.

**Test Coverage:**

- `apps/web/src/pages/LandingPage.test.tsx`

---

### Chunk 5 — Auth UI Frontend

**Status:** IN_PROGRESS

**Scope:** Register and login forms, auth context, and protected-route wrapper.

**Files Changed:**

- `apps/web/src/pages/RegisterPage.tsx`
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/context/AuthContext.tsx`
- `apps/web/src/hooks/useAuth.ts`
- `apps/web/src/components/ProtectedRoute.tsx`
- `apps/web/src/lib/api.ts`

**Depends On:** Chunk 3 (backend auth), Chunk 4 (routing/layout).

**Accept When:**

- Users can register and log in via UI.
- Auth state is fetched from `/api/auth/me` on app load.
- Protected routes redirect to `/login` when unauthenticated.
- Registration form validates email format and password length ≥ 8.

**Test Coverage:**

- `apps/web/src/pages/LoginPage.test.tsx`
- `apps/web/src/pages/RegisterPage.test.tsx`

---

### Chunk 6 — Stripe Backend & Subscription Gating (complex)

**Status:** COMPLETED

**Scope:** Stripe Checkout Session, webhook handler, subscription repository, and middleware that gates document access behind active subscription.

**Files Changed:**

- `apps/api/src/lib/stripe.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/services/billingService.ts`
- `apps/api/src/repositories/subscriptionRepository.ts`
- `apps/api/src/middleware/requireSubscription.ts`
- `apps/api/src/types/subscription.ts`

**Depends On:** Chunk 2 (repositories), Chunk 3 (auth).

**Accept When:**

- `POST /api/billing/checkout-session` creates a Stripe Checkout Session with the configured test price and returns `client_secret`/`url`.
- Webhook `POST /api/billing/webhook` (raw body) listens for `checkout.session.completed` and `customer.subscription.updated/deleted` and updates the `subscriptions` table.
- `requireSubscription` middleware returns `403` for non-subscribers.
- Subscription status is exposed on `/api/auth/me` as `isSubscriber`.
- Webhook handler is idempotent (checks existing subscription before update).

**Test Coverage:**

- `apps/api/src/routes/billing.test.ts` (mocked Stripe SDK)
- `apps/api/src/middleware/requireSubscription.test.ts`

---

### Chunk 7 — Document Backend API

**Status:** COMPLETED

**Scope:** CRUD endpoints for documents; subscriber-only access via layered services and repositories.

**Files Changed:**

- `apps/api/src/routes/documents.ts`
- `apps/api/src/services/documentService.ts`
- `apps/api/src/repositories/documentRepository.ts`
- `apps/api/src/types/document.ts`

**Depends On:** Chunk 2 (repositories), Chunk 6 (subscription gating).

**Accept When:**

- `GET /api/documents` returns the user’s documents sorted by `updatedAt` desc.
- `POST /api/documents` creates a document with default title and empty Tiptap JSON content.
- `GET /api/documents/:id` returns a single document if owned by user.
- `PATCH /api/documents/:id` updates title and/or content.
- `DELETE /api/documents/:id` deletes after confirming ownership.
- All endpoints require both authentication and active subscription.

**Test Coverage:**

- `apps/api/src/routes/documents.test.ts`
- `apps/api/src/services/documentService.test.ts`

---

### Chunk 8 — Editor & Document Workspace Frontend (complex)

**Status:** COMPLETED

**Scope:** Tiptap-based editor, document list sidebar, create/rename/delete, and auto-save with debounce.

**Files Changed:**

- `apps/web/src/pages/EditorPage.tsx`
- `apps/web/src/components/Editor.tsx` (Tiptap wrapper)
- `apps/web/src/components/DocumentList.tsx`
- `apps/web/src/components/RenameDocumentDialog.tsx`
- `apps/web/src/components/DeleteDocumentDialog.tsx`
- `apps/web/src/hooks/useDocuments.ts`
- `apps/web/src/lib/tiptapExtensions.ts`

**Depends On:** Chunk 5 (auth UI), Chunk 7 (document API).

**Accept When:**

- Subscribers see a document list sidebar and a Tiptap editor.
- Creating a document adds it to the list and opens it.
- Editor auto-saves content 1 second after typing stops; shows “Saved” / “Saving” / “Unsaved” status.
- Users can rename and delete documents with confirmation.
- Non-subscribers see an upsell screen instead of the editor.
- Empty state shown when no documents exist.

**Test Coverage:**

- `apps/web/src/components/Editor.test.tsx`
- `apps/web/src/hooks/useDocuments.test.ts`

---

### Chunk 9 — Billing Frontend

**Status:** COMPLETED

**Scope:** Subscribe button, checkout redirect, post-payment return page, and subscription status UI.

**Files Changed:**

- `apps/web/src/components/SubscribeButton.tsx`
- `apps/web/src/pages/CheckoutReturnPage.tsx`
- `apps/web/src/hooks/useBilling.ts`
- `apps/web/src/components/BillingStatus.tsx`

**Depends On:** Chunk 5 (auth UI), Chunk 6 (Stripe backend).

**Accept When:**

- Logged-in non-subscribers see “Subscribe” CTA.
- Clicking CTA calls `/api/billing/checkout-session` and redirects to Stripe Checkout (test mode).
- `/checkout-return?success=true` refetches auth state and lands user in editor.
- Success/cancel messages display appropriately.

**Test Coverage:**

- `apps/web/src/pages/CheckoutReturnPage.test.tsx`

---

### Chunk 10 — Integration Tests, Stripe Test Verification & Documentation

**Status:** COMPLETED

**Scope:** End-to-end flow tests, webhook manual verification guide, README, and environment setup docs.

**Files Changed:**

- `README.md`
- `.env.example`
- `apps/api/src/tests/integration/documents.integration.test.ts`
- `apps/web/src/tests/integration/auth-flow.test.tsx` (optional)

**Depends On:** Chunks 1–9.

**Accept When:**

- Integration test covers: register → create checkout session (mocked) → webhook marks subscriber → create/edit/save document.
- README documents: install steps, env vars (`DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SESSION_SECRET`, `STRIPE_PRICE_ID`), Stripe CLI webhook forwarding command, and test card numbers.
- `pnpm test` passes in both `apps/web` and `apps/api`.

**Test Coverage:**

- Integration tests listed above.

## Verification Strategy

| Chunk | Verification                                                                         |
| ----- | ------------------------------------------------------------------------------------ |
| 1     | `pnpm install && pnpm dev`; hit `/api/health`.                                       |
| 2     | `pnpm db:migrate` and run repository unit tests.                                     |
| 3     | Run auth route tests; manually register/login via UI.                                |
| 4     | Visual check on mobile/desktop; landing page test.                                   |
| 5     | Manual register/login/logout flow; protected route redirect.                         |
| 6     | Mock Stripe tests; use Stripe CLI to forward webhook and verify subscription record. |
| 7     | Run document route tests; manually create/rename/delete via UI.                      |
| 8     | Type in editor, verify auto-save debounce and “Saved” status.                        |
| 9     | Use Stripe test card `4242 4242 4242 4242`; confirm post-payment editor access.      |
| 10    | Run full `pnpm test`; follow README webhook steps.                                   |

## Decision Log

| Decision                      | Rationale                                                                                             | Rejected Alternatives                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Vite SPA + Express API        | Clear separation matches the “Node.js backend” requirement; easier layered architecture than Next.js. | Next.js full-stack, Remix.                                                                                                                 |
| Passport.js + express-session | Battle-tested, server-validated sessions; `connect-sqlite3` stores sessions in the same SQLite DB.    | Lucia (also good, but Passport has wider ecosystem), custom JWT.                                                                           |
| Drizzle ORM + better-sqlite3  | Type-safe migrations and queries; better-sqlite3 is synchronous and fast for local SQLite.            | Prisma (heavier), raw `sqlite3` (no schema safety).                                                                                        |
| Tiptap editor                 | MIT-licensed core, safe for paid products; first-class React support; stores ProseMirror JSON.        | CKEditor/TinyMCE (copyleft/commercial dual license concern), Quill (stalled maintenance), Lexical (also MIT but less extension ecosystem). |
| Stripe Checkout Session       | Simplest reliable subscription flow; webhook confirms access.                                         | Payment Element (more UI work, no advantage here).                                                                                         |
| Auto-save with 1 s debounce   | Good UX for a writing app; still documented and testable.                                             | Manual-only save.                                                                                                                          |
| Monthly subscription, $9/mo   | Simple single-plan pricing; exact amount can be changed in Stripe dashboard.                          | Multiple tiers, one-time purchase.                                                                                                         |
| pnpm workspaces               | Fast, disk-efficient monorepo; standard for this stack.                                               | npm workspaces, separate repos.                                                                                                            |

## Risks

| Risk                                                     | Likelihood | Mitigation                                                                                                                       |
| -------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Stripe webhook signature verification fails in local dev | Medium     | Document Stripe CLI `listen --forward-to localhost:3000/api/billing/webhook`; include `STRIPE_WEBHOOK_SECRET` in `.env.example`. |
| Session store not thread-safe under load                 | Low        | SQLite session store is fine for local/testing; document migration path to Redis for scale.                                      |
| Tiptap Pro extensions accidentally introduced            | Medium     | Pin only `@tiptap/core`, `@tiptap/react`, and free extensions; review every added package.                                       |
| Auto-save races with rapid edits                         | Low        | Debounce 1 s and disable save while a request is in flight; use PATCH only.                                                      |
| Password hashing slow in tests                           | Low        | Use `bcrypt.hashSync` with low rounds in test env.                                                                               |

## Appendix: License Review for Commercial Use

All tools and libraries selected for the plan are permissively licensed and safe for use in a paid/commercial product.

| Tool / Library                         | License       | OK for Paid Product? | Notes                                                                                                                  |
| -------------------------------------- | ------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| React                                  | MIT           | ✅ Yes               | Meta's UI library; free for commercial use.                                                                            |
| Vite                                   | MIT           | ✅ Yes               | Build tool/dev server.                                                                                                 |
| TypeScript                             | Apache-2.0    | ✅ Yes               | Microsoft language; permissive.                                                                                        |
| Tailwind CSS                           | MIT           | ✅ Yes               | Utility CSS framework.                                                                                                 |
| Node.js runtime                        | MIT           | ✅ Yes               | Runtime license.                                                                                                       |
| pnpm                                   | MIT           | ✅ Yes               | Package manager / workspaces.                                                                                          |
| Express                                | MIT           | ✅ Yes               | Web framework.                                                                                                         |
| Passport.js                            | MIT           | ✅ Yes               | Authentication middleware.                                                                                             |
| express-session                        | MIT           | ✅ Yes               | Session middleware.                                                                                                    |
| connect-sqlite3                        | MIT           | ✅ Yes               | SQLite session store.                                                                                                  |
| bcrypt                                 | MIT           | ✅ Yes               | Password hashing.                                                                                                      |
| Drizzle ORM                            | Apache-2.0    | ✅ Yes               | Type-safe ORM.                                                                                                         |
| better-sqlite3                         | MIT           | ✅ Yes               | SQLite driver.                                                                                                         |
| SQLite                                 | Public Domain | ✅ Yes               | Embedded database engine.                                                                                              |
| Tiptap Editor (core + free extensions) | MIT           | ✅ Yes               | Only the open-source editor core is MIT. Tiptap Cloud / Pro extensions are paid and must not be used unless purchased. |
| Stripe Node SDK                        | MIT           | ✅ Yes               | SDK license is MIT. Stripe's service has separate Terms of Service, which is normal for any payment processor.         |

### Editors to Avoid Without a Commercial License

- **CKEditor** — GPL/commercial dual license.
- **TinyMCE** — LGPL/commercial dual license.

The plan explicitly uses **Tiptap core (MIT)** to avoid copyleft licensing risk.

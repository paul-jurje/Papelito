// End-to-end integration test covering the subscriber-only document flow:
//
//   1. Register a new user via the public API (session cookie established).
//   2. Confirm auth state via /api/auth/me
//      (with `isSubscriber: false` because the user has no Stripe subscription).
//   3. Confirm document creation is gated by subscription (403).
//   4. Create a Stripe Checkout Session — the Stripe SDK is fully mocked.
//   5. POST a signed `checkout.session.completed` webhook so the server
//      promotes the user to an active subscriber (server-side gating).
//   6. Re-check /api/auth/me — now `isSubscriber: true`.
//   7. Create / edit / save / list / delete a document — all 2xx.
//
// The test exercises the full app stack (routes + middleware + services +
// repositories + SQLite) through supertest, with only the Stripe SDK
// replaced by a mock so no network calls leave the process.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { app } from '../../index.js';
import { db } from '../../db/index.js';
import { createTestDb, type TestDbHandle } from '../../test/createTestDb.js';
import { getSubscriptionByUserId } from '../../repositories/subscriptionRepository.js';

// `vi.hoisted` runs BEFORE any module-level imports so we can set env vars
// before `../../lib/stripe.js` is evaluated (it throws if STRIPE_SECRET_KEY
// is missing) and before `../../index.js` builds the app. The mock object
// referenced from the `vi.mock` factory must also be defined here, because
// vitest hoists `vi.mock` calls above imports but does NOT hoist variable
// references.
const { stripeMock } = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_integration';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_integration';
  process.env.STRIPE_PRICE_ID = 'price_test_integration';
  return {
    stripeMock: {
      customers: {
        list: vi.fn(),
        create: vi.fn(),
      },
      checkout: {
        sessions: {
          create: vi.fn(),
        },
      },
      subscriptions: {
        retrieve: vi.fn(),
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    },
  };
});

vi.mock('../../lib/stripe.js', () => ({
  stripe: stripeMock,
}));

// `vi.clearAllMocks` resets call history between tests so the per-test mocks
// don't bleed into each other. (It does NOT remove mock implementations.)
beforeEach(() => {
  vi.clearAllMocks();
});

const SAMPLE_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Integration test' }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello from the integration test.' }],
    },
  ],
};

const UPDATED_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Edited content — saved via PATCH.' }],
    },
  ],
};

/**
 * Produce a `stripe-signature` header value for a payload using a webhook
 * secret. Mirrors the format Stripe sends in real life: `t=<ts>,v1=<hmac>`.
 */
function signPayload(payload: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const sig = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${ts},v1=${sig}`;
}

/**
 * Registers a user via the public auth API and returns an authenticated
 * supertest agent plus the new user's id.
 */
async function registerUser(
  email: string,
  password = 'password123',
): Promise<{ authed: ReturnType<typeof request.agent>; userId: number }> {
  const authed = request.agent(app);
  const reg = await authed.post('/api/auth/register').send({ email, password });
  expect(reg.status).toBe(201);
  return { authed, userId: reg.body.user.id as number };
}

/**
 * Drives the billing half of the journey for an already-registered user:
 *   - POST /api/billing/checkout-session (Stripe SDK mocked),
 *   - POST a signed `checkout.session.completed` webhook,
 *   - verify the local subscription row is now `active`.
 *
 * Mock implementations are set here (rather than relying on
 * `clearAllMocks`-cleared defaults) so each call is self-contained and
 * order-independent — important when the helper runs more than once in
 * the same test.
 */
async function activateSubscription(
  authed: ReturnType<typeof request.agent>,
  userId: number,
  email: string,
): Promise<void> {
  // 4. Create a Stripe Checkout Session (mocked).
  stripeMock.customers.list.mockResolvedValueOnce({ data: [] });
  stripeMock.customers.create.mockResolvedValueOnce({
    id: `cus_${userId}`,
  });
  stripeMock.checkout.sessions.create.mockResolvedValueOnce({
    id: `cs_${userId}`,
    url: `https://stripe.test/cs_${userId}`,
  });

  const checkoutRes = await authed.post('/api/billing/checkout-session');
  expect(checkoutRes.status).toBe(200);
  expect(checkoutRes.body).toEqual({
    url: `https://stripe.test/cs_${userId}`,
    sessionId: `cs_${userId}`,
  });

  // 5. Simulate Stripe calling our webhook after the customer pays.
  const event = {
    id: `evt_${userId}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${userId}`,
        customer: `cus_${userId}`,
        subscription: `sub_${userId}`,
        client_reference_id: String(userId),
        customer_email: email,
      },
    },
  };
  stripeMock.webhooks.constructEvent.mockReturnValueOnce(event);
  stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
    id: `sub_${userId}`,
    customer: `cus_${userId}`,
    status: 'active',
    items: { data: [{ current_period_end: 1_700_000_000 }] },
  });

  const payload = JSON.stringify(event);
  const sig = signPayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);

  const webhookRes = await request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', sig)
    .send(payload);
  expect(webhookRes.status).toBe(200);
  expect(webhookRes.body).toEqual({ received: true });

  // The local subscription row should now be `active`.
  const sub = getSubscriptionByUserId(db, userId);
  expect(sub).toBeDefined();
  expect(sub!.status).toBe('active');
  expect(sub!.stripeCustomerId).toBe(`cus_${userId}`);
  expect(sub!.stripeSubscriptionId).toBe(`sub_${userId}`);
  expect(sub!.currentPeriodEnd).toBeInstanceOf(Date);
}

describe('subscriber-only document flow (integration)', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    // Each test gets its own in-memory DB so they don't interfere.
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('walks a new user through the full subscriber journey end-to-end', async () => {
    const email = 'journey@example.com';
    const { authed, userId } = await registerUser(email);

    // 2. /api/auth/me confirms the session is established and that the
    //    freshly-registered user is NOT a subscriber yet.
    const meBefore = await authed.get('/api/auth/me');
    expect(meBefore.status).toBe(200);
    expect(meBefore.body.user.email).toBe(email);
    expect(meBefore.body.isSubscriber).toBe(false);

    // 3. Document creation must be rejected with 403 until the webhook
    //    upgrades the user.
    const blocked = await authed.post('/api/documents').send({});
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/subscription/i);

    const blockedList = await authed.get('/api/documents');
    expect(blockedList.status).toBe(403);

    // 4 + 5. Run the billing half of the journey (mocked Stripe) so the
    //         user becomes a subscriber server-side.
    await activateSubscription(authed, userId, email);

    // 6. /api/auth/me now reports `isSubscriber: true` — this is the
    //    server-side proof the webhook took effect.
    const meAfter = await authed.get('/api/auth/me');
    expect(meAfter.status).toBe(200);
    expect(meAfter.body.user.email).toBe(email);
    expect(meAfter.body.isSubscriber).toBe(true);

    // 7. Subscriber-only document CRUD now succeeds.
    const created = await authed
      .post('/api/documents')
      .send({ title: 'My first doc', content: SAMPLE_CONTENT });
    expect(created.status).toBe(201);
    expect(created.body.document).toMatchObject({
      title: 'My first doc',
      userId,
    });
    expect(JSON.parse(created.body.document.content)).toEqual(SAMPLE_CONTENT);
    const docId = created.body.document.id as number;

    // Edit / save the document via PATCH.
    const patched = await authed
      .patch(`/api/documents/${docId}`)
      .send({ title: 'My edited doc', content: UPDATED_CONTENT });
    expect(patched.status).toBe(200);
    expect(patched.body.document.title).toBe('My edited doc');
    expect(JSON.parse(patched.body.document.content)).toEqual(UPDATED_CONTENT);

    // GET single document by id.
    const fetched = await authed.get(`/api/documents/${docId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.document.id).toBe(docId);
    expect(fetched.body.document.title).toBe('My edited doc');
    expect(JSON.parse(fetched.body.document.content)).toEqual(UPDATED_CONTENT);

    // List returns the document (and only that one).
    const list = await authed.get('/api/documents');
    expect(list.status).toBe(200);
    expect(list.body.documents).toHaveLength(1);
    expect(list.body.documents[0].id).toBe(docId);
    expect(list.body.documents[0].title).toBe('My edited doc');

    // Delete the document.
    const removed = await authed.delete(`/api/documents/${docId}`);
    expect(removed.status).toBe(204);

    // Confirm it's gone.
    const afterDelete = await authed.get(`/api/documents/${docId}`);
    expect(afterDelete.status).toBe(404);

    const finalList = await authed.get('/api/documents');
    expect(finalList.status).toBe(200);
    expect(finalList.body.documents).toEqual([]);
  });

  it('rejects document creation when subscription status is not active', async () => {
    // Register a user but do NOT activate them — instead, simulate a webhook
    // for `customer.subscription.updated` with status `past_due`. Document
    // endpoints must still 403.
    const { authed, userId } = await registerUser('cancelled@example.com');

    const event = {
      id: 'evt_past_due',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_past_due',
          customer: 'cus_past_due',
          status: 'past_due',
          metadata: { userId: String(userId) },
          items: { data: [{ current_period_end: 1_700_000_000 }] },
        },
      },
    };
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(event);
    const payload = JSON.stringify(event);
    const sig = signPayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);
    const webhookRes = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload);
    expect(webhookRes.status).toBe(200);

    const sub = getSubscriptionByUserId(db, userId);
    expect(sub!.status).toBe('past_due');

    // Document endpoints must still 403.
    const created = await authed.post('/api/documents').send({});
    expect(created.status).toBe(403);

    const list = await authed.get('/api/documents');
    expect(list.status).toBe(403);

    // /api/auth/me should reflect that the user is NOT a subscriber.
    const me = await authed.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.isSubscriber).toBe(false);
  });

  it('does not leak another user\'s documents even after both are subscribed', async () => {
    // Subscribe user A.
    const a = await registerUser('alice-iso@example.com');
    await activateSubscription(a.authed, a.userId, 'alice-iso@example.com');

    // Subscribe user B in a separate session.
    const b = await registerUser('bob-iso@example.com');
    await activateSubscription(b.authed, b.userId, 'bob-iso@example.com');

    // Alice creates two documents.
    const aDoc1 = await a.authed.post('/api/documents').send({ title: 'A1' });
    const aDoc2 = await a.authed.post('/api/documents').send({ title: 'A2' });
    expect(aDoc1.status).toBe(201);
    expect(aDoc2.status).toBe(201);

    // Bob sees his own (empty) list — Alice's docs do not leak.
    const bList = await b.authed.get('/api/documents');
    expect(bList.status).toBe(200);
    expect(bList.body.documents).toEqual([]);

    // Bob cannot read Alice's document by id.
    const bGet = await b.authed.get(`/api/documents/${aDoc1.body.document.id}`);
    expect(bGet.status).toBe(404);

    // Bob cannot edit Alice's document.
    const bPatch = await b.authed
      .patch(`/api/documents/${aDoc1.body.document.id}`)
      .send({ title: 'pwned' });
    expect(bPatch.status).toBe(404);

    // Bob cannot delete Alice's document.
    const bDelete = await b.authed.delete(
      `/api/documents/${aDoc1.body.document.id}`,
    );
    expect(bDelete.status).toBe(404);

    // Alice's list still contains her two documents, untouched.
    const aList = await a.authed.get('/api/documents');
    expect(aList.status).toBe(200);
    expect(aList.body.documents).toHaveLength(2);
    const aIds = (aList.body.documents as Array<{ id: number }>).map(
      (d) => d.id,
    );
    expect(aIds).toContain(aDoc1.body.document.id);
    expect(aIds).toContain(aDoc2.body.document.id);
  });
});

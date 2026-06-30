import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { app } from '../index.js';
import { db } from '../db/index.js';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import {
  createOrUpdateSubscription,
  getSubscriptionByUserId,
} from '../repositories/subscriptionRepository.js';
import { upsertPlan } from '../repositories/planRepository.js';

// `vi.hoisted` runs BEFORE any module-level imports so we can set env vars
// before `../lib/stripe.js` is evaluated (it throws if STRIPE_SECRET_KEY is
// missing) and before `../index.js` builds the app. It also gives us a place
// to define the mock object that the `vi.mock` factory will close over
// (vitest hoists `vi.mock` calls above imports but does NOT hoist variable
// references, so the factory must reference an identifier created here).
const { stripeMock } = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';
  const stripeMock = {
    customers: {
      list: vi.fn(),
      create: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  return { stripeMock };
});

vi.mock('../lib/stripe.js', () => ({
  stripe: stripeMock,
}));

const agent = () => request.agent(app);

// `vi.clearAllMocks` resets call history between tests so the per-test mocks
// don't bleed into each other. (It does NOT remove mock implementations.)
beforeEach(() => {
  vi.clearAllMocks();
});

function seedPlan(stripePriceId: string) {
  return upsertPlan(db, {
    stripePriceId,
    displayName: 'Test Plan',
    interval: 'month',
    amountCents: 599,
    currency: 'eur',
    active: true,
  });
}

function signPayload(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const sig = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${ts},v1=${sig}`;
}

describe('GET /api/billing/plans', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('returns active plans sorted by price', async () => {
    const monthly = upsertPlan(db, {
      stripePriceId: 'price_monthly',
      displayName: 'Monthly',
      interval: 'month',
      amountCents: 599,
      currency: 'eur',
      active: true,
    });
    upsertPlan(db, {
      stripePriceId: 'price_yearly',
      displayName: 'Yearly',
      interval: 'year',
      amountCents: 5499,
      currency: 'eur',
      active: true,
    });
    upsertPlan(db, {
      stripePriceId: 'price_inactive',
      displayName: 'Inactive',
      interval: 'month',
      amountCents: 100,
      currency: 'eur',
      active: false,
    });

    const res = await request(app).get('/api/billing/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(2);
    expect(res.body.plans.map((p: { id: number }) => p.id)).toEqual([
      monthly.id,
      expect.any(Number),
    ]);
    expect(res.body.plans[0]).toMatchObject({
      displayName: 'Monthly',
      interval: 'month',
      amountCents: 599,
      currency: 'eur',
    });
    expect(res.body.plans[1]).toMatchObject({
      displayName: 'Yearly',
      interval: 'year',
      amountCents: 5499,
      currency: 'eur',
    });
  });
});

describe('POST /api/billing/checkout-session', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
    stripeMock.customers.list.mockReset();
    stripeMock.customers.create.mockReset();
    stripeMock.checkout.sessions.create.mockReset();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/billing/checkout-session');
    expect(res.status).toBe(401);
  });

  it('returns 400 when planId is missing', async () => {
    const a = agent();
    await a.post('/api/auth/register').send({
      email: 'noplan@example.com',
      password: 'password123',
    });
    const res = await a.post('/api/billing/checkout-session').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when the plan is invalid or inactive', async () => {
    const a = agent();
    await a.post('/api/auth/register').send({
      email: 'badplan@example.com',
      password: 'password123',
    });
    const res = await a.post('/api/billing/checkout-session').send({ planId: '99999' });
    expect(res.status).toBe(400);
  });

  it('reuses an existing Stripe Customer id and returns { url, sessionId }', async () => {
    // Seed a user with a known subscription row (simulating prior checkout)
    const a = agent();
    const reg = await a.post('/api/auth/register').send({
      email: 'buyer@example.com',
      password: 'password123',
    });
    expect(reg.status).toBe(201);
    const userId = reg.body.user!.id as number;

    // Persist a local subscription row with a known Stripe Customer id so the
    // service short-circuits the customers.list / customers.create lookup and
    // reuses the existing customer.
    createOrUpdateSubscription(db, {
      userId,
      stripeCustomerId: 'cus_existing',
      status: 'inactive',
    });

    const plan = seedPlan('price_existing');

    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://stripe.test/cs_test_123',
    });

    // Reuse the same agent so the session cookie set by /register is sent.
    const res = await a.post('/api/billing/checkout-session').send({ planId: String(plan.id) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      url: 'https://stripe.test/cs_test_123',
      sessionId: 'cs_test_123',
    });

    expect(stripeMock.customers.list).not.toHaveBeenCalled();
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const args = stripeMock.checkout.sessions.create.mock.calls[0]![0];
    expect(args.mode).toBe('subscription');
    expect(args.customer).toBe('cus_existing');
    expect(args.client_reference_id).toBe(String(userId));
    expect(args.line_items).toEqual([{ price: plan.stripePriceId, quantity: 1 }]);
    expect(args.success_url).toContain('checkout-return');
    expect(args.cancel_url).toContain('checkout-return');
  });

  it('looks up an existing customer by email when no local customer is linked', async () => {
    const a = agent();
    await a.post('/api/auth/register').send({
      email: 'returning@example.com',
      password: 'password123',
    });
    const plan = seedPlan('price_returning');

    stripeMock.customers.list.mockResolvedValue({
      data: [{ id: 'cus_from_list' }],
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_456',
      url: 'https://stripe.test/cs_test_456',
    });

    const res = await a.post('/api/billing/checkout-session').send({ planId: String(plan.id) });
    expect(res.status).toBe(200);
    expect(stripeMock.customers.list).toHaveBeenCalledWith({
      email: 'returning@example.com',
      limit: 1,
    });
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create.mock.calls[0]![0].customer).toBe('cus_from_list');
  });

  it('creates a new customer when none exists in Stripe', async () => {
    const a = agent();
    const reg = await a.post('/api/auth/register').send({
      email: 'newbuyer@example.com',
      password: 'password123',
    });
    const userId = reg.body.user!.id as number;
    const plan = seedPlan('price_newbuyer');

    stripeMock.customers.list.mockResolvedValue({ data: [] });
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_newly_made' });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_789',
      url: 'https://stripe.test/cs_test_789',
    });

    const res = await a.post('/api/billing/checkout-session').send({ planId: String(plan.id) });
    expect(res.status).toBe(200);
    expect(stripeMock.customers.create).toHaveBeenCalledWith({
      email: 'newbuyer@example.com',
      metadata: { userId: String(userId) },
    });
  });
});

describe('GET /api/billing/session/:sessionId', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
    stripeMock.checkout.sessions.retrieve.mockReset();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/billing/session/cs_test_123');
    expect(res.status).toBe(401);
  });

  it('returns 400 for a malformed session id', async () => {
    const a = agent();
    await a.post('/api/auth/register').send({
      email: 'session@example.com',
      password: 'password123',
    });

    const res = await a.get('/api/billing/session/not-a-session');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid session id/i);
  });

  it('returns verified:false for an open session', async () => {
    const a = agent();
    const reg = await a.post('/api/auth/register').send({
      email: 'open@example.com',
      password: 'password123',
    });
    const userId = reg.body.user!.id as number;

    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_open',
      mode: 'subscription',
      payment_status: 'unpaid',
      client_reference_id: String(userId),
    });

    const res = await a.get('/api/billing/session/cs_open');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: false, sessionId: 'cs_open' });
  });

  it('verifies a paid session and activates the subscription', async () => {
    const a = agent();
    const reg = await a.post('/api/auth/register').send({
      email: 'paidroute@example.com',
      password: 'password123',
    });
    const userId = reg.body.user!.id as number;
    const plan = seedPlan('price_paidroute');

    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_paidroute',
      mode: 'subscription',
      payment_status: 'paid',
      client_reference_id: String(userId),
      customer: 'cus_paidroute',
      subscription: {
        id: 'sub_paidroute',
        customer: 'cus_paidroute',
        status: 'active',
        items: {
          data: [
            {
              current_period_end: 1_700_000_000,
              price: { id: plan.stripePriceId },
            },
          ],
        },
      },
    });

    const res = await a.get('/api/billing/session/cs_paidroute');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      verified: true,
      status: 'active',
      sessionId: 'cs_paidroute',
    });

    const sub = getSubscriptionByUserId(db, userId);
    expect(sub).toBeDefined();
    expect(sub!.status).toBe('active');
    expect(sub!.planId).toBe(plan.id);
  });
});

describe('POST /api/billing/webhook', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
    stripeMock.webhooks.constructEvent.mockReset();
    stripeMock.subscriptions.retrieve.mockReset();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('rejects requests with missing signature header', async () => {
    const res = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/signature/i);
  });

  it('rejects requests whose signature does not verify', async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const payload = JSON.stringify({ type: 'checkout.session.completed' });
    const sig = signPayload(payload, 'wrong-secret');

    const res = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/signature/i);
  });

  it('processes checkout.session.completed and marks user as subscribed (idempotent)', async () => {
    const a = agent();
    const reg = await a.post('/api/auth/register').send({
      email: 'buyer@example.com',
      password: 'password123',
    });
    const userId = reg.body.user!.id as number;

    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          customer: 'cus_test_1',
          subscription: 'sub_test_1',
          client_reference_id: String(userId),
          customer_email: 'buyer@example.com',
        },
      },
    };
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_test_1',
      customer: 'cus_test_1',
      status: 'active',
      items: { data: [{ current_period_end: 1_700_000_000 }] },
    });

    const payload = JSON.stringify(event);
    const sig = signPayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);

    // First delivery
    const res1 = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload);
    expect(res1.status).toBe(200);
    expect(res1.body).toEqual({ received: true });

    const sub1 = getSubscriptionByUserId(db, userId);
    expect(sub1).toBeDefined();
    expect(sub1!.status).toBe('active');
    expect(sub1!.stripeCustomerId).toBe('cus_test_1');
    expect(sub1!.stripeSubscriptionId).toBe('sub_test_1');
    expect(sub1!.currentPeriodEnd).toBeInstanceOf(Date);

    // Second delivery (idempotent) — same event, same outcome, still active.
    const res2 = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload);
    expect(res2.status).toBe(200);
    const sub2 = getSubscriptionByUserId(db, userId);
    expect(sub2!.status).toBe('active');
    expect(sub2!.stripeSubscriptionId).toBe('sub_test_1');
  });

  it('processes customer.subscription.updated and reflects the new status', async () => {
    const a = agent();
    const reg = await a.post('/api/auth/register').send({
      email: 'sub@example.com',
      password: 'password123',
    });
    const userId = reg.body.user!.id as number;

    // Seed an active subscription so we can verify a status change.
    createOrUpdateSubscription(db, {
      userId,
      stripeCustomerId: 'cus_x',
      stripeSubscriptionId: 'sub_x',
      status: 'active',
    });

    const event = {
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_x',
          customer: 'cus_x',
          status: 'past_due',
          metadata: { userId: String(userId) },
          items: { data: [{ current_period_end: 1_800_000_000 }] },
        },
      },
    };
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    const payload = JSON.stringify(event);
    const sig = signPayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);

    const res = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload);
    expect(res.status).toBe(200);

    const sub = getSubscriptionByUserId(db, userId);
    expect(sub!.status).toBe('past_due');
    expect(sub!.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it('processes customer.subscription.deleted', async () => {
    const a = agent();
    const reg = await a.post('/api/auth/register').send({
      email: 'cancel@example.com',
      password: 'password123',
    });
    const userId = reg.body.user!.id as number;
    createOrUpdateSubscription(db, {
      userId,
      stripeCustomerId: 'cus_z',
      stripeSubscriptionId: 'sub_z',
      status: 'active',
    });

    const event = {
      id: 'evt_3',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_z',
          customer: 'cus_z',
          status: 'canceled',
          metadata: { userId: String(userId) },
          items: { data: [] },
        },
      },
    };
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    const payload = JSON.stringify(event);
    const sig = signPayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);

    const res = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload);
    expect(res.status).toBe(200);

    const sub = getSubscriptionByUserId(db, userId);
    expect(sub!.status).toBe('canceled');
  });
});

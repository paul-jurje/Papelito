import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type Stripe from 'stripe';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { db } from '../db/index.js';
import { upsertPlan } from '../repositories/planRepository.js';
import {
  createOrUpdateSubscription,
  getSubscriptionByUserId,
} from '../repositories/subscriptionRepository.js';
import { createUser } from '../repositories/userRepository.js';
import {
  createCheckoutSession,
  processWebhookEvent,
  PlanNotFoundError,
  InactivePlanError,
} from './billingService.js';

const { stripeStub } = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

  const stripeStub = {
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
  };

  return { stripeStub };
});

function makeStripe(): Stripe {
  return stripeStub as unknown as Stripe;
}

function seedPlan(
  stripePriceId: string,
  active = true,
  overrides: Partial<Parameters<typeof upsertPlan>[1]> = {},
) {
  return upsertPlan(db, {
    stripePriceId,
    displayName: 'Test Plan',
    interval: 'month',
    amountCents: 599,
    currency: 'eur',
    active,
    ...overrides,
  });
}

function seedUser(email: string): number {
  return createUser(db, { email, passwordHash: 'hash' }).id;
}

describe('billingService', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  describe('createCheckoutSession', () => {
    it('creates a checkout session for an active plan', async () => {
      const userId = seedUser('active@example.com');
      const plan = seedPlan('price_active');
      const client = makeStripe();
      (client.customers.list as Mock).mockResolvedValue({ data: [] });
      (client.customers.create as Mock).mockResolvedValue({ id: 'cus_new' });
      (client.checkout.sessions.create as Mock).mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://stripe.test/cs_test_123',
      });

      const result = await createCheckoutSession(userId, String(plan.id), 'active@example.com', {
        stripeClient: client,
      });

      expect(result).toEqual({
        url: 'https://stripe.test/cs_test_123',
        sessionId: 'cs_test_123',
      });
      expect(client.customers.create).toHaveBeenCalledWith({
        email: 'active@example.com',
        metadata: { userId: String(userId) },
      });
      expect(client.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          customer: 'cus_new',
          client_reference_id: '1',
          line_items: [{ price: 'price_active', quantity: 1 }],
          success_url: expect.stringContaining('checkout-return'),
          cancel_url: expect.stringContaining('checkout-return'),
        }),
      );
    });

    it('reuses an existing Stripe customer linked to the user', async () => {
      const userId = seedUser('reuse@example.com');
      const plan = seedPlan('price_active');
      const client = makeStripe();
      createOrUpdateSubscription(db, {
        userId,
        stripeCustomerId: 'cus_existing',
        status: 'inactive',
      });
      (client.checkout.sessions.create as Mock).mockResolvedValue({
        id: 'cs_test_456',
        url: 'https://stripe.test/cs_test_456',
      });

      const result = await createCheckoutSession(userId, String(plan.id), 'buyer@example.com', {
        stripeClient: client,
      });

      expect(result.sessionId).toBe('cs_test_456');
      expect(client.customers.list).not.toHaveBeenCalled();
      expect(client.customers.create).not.toHaveBeenCalled();
      expect(client.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_existing' }),
      );
    });

    it('throws PlanNotFoundError for an unknown plan id', async () => {
      const userId = seedUser('unknown@example.com');
      const client = makeStripe();
      await expect(
        createCheckoutSession(userId, '99999', 'buyer@example.com', {
          stripeClient: client,
        }),
      ).rejects.toBeInstanceOf(PlanNotFoundError);
      expect(client.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('throws PlanNotFoundError for a non-numeric plan id', async () => {
      const userId = seedUser('nonnumeric@example.com');
      const client = makeStripe();
      await expect(
        createCheckoutSession(userId, 'not-a-plan', 'buyer@example.com', {
          stripeClient: client,
        }),
      ).rejects.toBeInstanceOf(PlanNotFoundError);
    });

    it('throws InactivePlanError for an inactive plan', async () => {
      const userId = seedUser('inactive@example.com');
      const plan = seedPlan('price_inactive', false);
      const client = makeStripe();
      await expect(
        createCheckoutSession(userId, String(plan.id), 'buyer@example.com', {
          stripeClient: client,
        }),
      ).rejects.toBeInstanceOf(InactivePlanError);
      expect(client.checkout.sessions.create).not.toHaveBeenCalled();
    });
  });

  describe('processWebhookEvent', () => {
    it('records the resolved planId from checkout.session.completed', async () => {
      const userId = seedUser('checkout@example.com');
      const plan = seedPlan('price_checkout');
      const client = makeStripe();
      (client.subscriptions.retrieve as Mock).mockResolvedValue({
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        items: {
          data: [
            {
              current_period_end: 1_700_000_000,
              price: { id: plan.stripePriceId },
            },
          ],
        },
      });

      const event = {
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_1',
            customer: 'cus_1',
            subscription: 'sub_1',
            client_reference_id: String(userId),
            customer_email: 'buyer@example.com',
          },
        },
      } as unknown as Stripe.Event;

      await processWebhookEvent(event, { stripeClient: client });

      const sub = getSubscriptionByUserId(db, userId);
      expect(sub).toBeDefined();
      expect(sub).toMatchObject({
        userId,
        planId: plan.id,
        status: 'active',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
      });
      expect(sub!.currentPeriodEnd).toBeInstanceOf(Date);
    });

    it('records a null planId when the checkout price does not match a local plan', async () => {
      const userId = seedUser('unknown-checkout@example.com');
      const client = makeStripe();
      (client.subscriptions.retrieve as Mock).mockResolvedValue({
        id: 'sub_2',
        customer: 'cus_2',
        status: 'active',
        items: {
          data: [
            {
              current_period_end: 1_700_000_000,
              price: { id: 'price_unknown' },
            },
          ],
        },
      });

      const event = {
        id: 'evt_2',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_2',
            customer: 'cus_2',
            subscription: 'sub_2',
            client_reference_id: String(userId),
            customer_email: 'buyer@example.com',
          },
        },
      } as unknown as Stripe.Event;

      await processWebhookEvent(event, { stripeClient: client });

      const sub = getSubscriptionByUserId(db, userId);
      expect(sub).toBeDefined();
      expect(sub!.planId).toBeNull();
      expect(sub!.status).toBe('active');
    });

    it('records the resolved planId from customer.subscription.updated', async () => {
      const userId = seedUser('sub@example.com');
      const plan = seedPlan('price_sub');
      const event = {
        id: 'evt_3',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_3',
            customer: 'cus_3',
            status: 'trialing',
            metadata: { userId: String(userId) },
            items: {
              data: [
                {
                  current_period_end: 1_800_000_000,
                  price: { id: plan.stripePriceId },
                },
              ],
            },
          },
        },
      } as unknown as Stripe.Event;

      await processWebhookEvent(event, { stripeClient: makeStripe() });

      const sub = getSubscriptionByUserId(db, userId);
      expect(sub).toBeDefined();
      expect(sub!.planId).toBe(plan.id);
      expect(sub!.status).toBe('trialing');
    });

    it('records a null planId when the subscription price does not match a local plan', async () => {
      const userId = seedUser('unknown-sub@example.com');
      const event = {
        id: 'evt_4',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_4',
            customer: 'cus_4',
            status: 'past_due',
            metadata: { userId: String(userId) },
            items: {
              data: [
                {
                  current_period_end: 1_800_000_000,
                  price: { id: 'price_unknown' },
                },
              ],
            },
          },
        },
      } as unknown as Stripe.Event;

      await processWebhookEvent(event, { stripeClient: makeStripe() });

      const sub = getSubscriptionByUserId(db, userId);
      expect(sub).toBeDefined();
      expect(sub!.planId).toBeNull();
      expect(sub!.status).toBe('past_due');
    });
  });
});

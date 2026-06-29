import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { subscriptions } from '../db/schema.js';
import { createUser } from './userRepository.js';
import { createOrUpdateSubscription, getSubscriptionByUserId } from './subscriptionRepository.js';
import { upsertPlan } from './planRepository.js';

function makeUser(handle: TestDbHandle, email: string): number {
  return createUser(handle.db, { email, passwordHash: 'hash' }).id;
}

describe('subscriptionRepository', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  describe('createOrUpdateSubscription', () => {
    it('inserts a new subscription with status "inactive" by default', () => {
      const userId = makeUser(handle, 'u1@example.com');
      const sub = createOrUpdateSubscription(handle.db, { userId });

      expect(sub.id).toBeTypeOf('number');
      expect(sub.userId).toBe(userId);
      expect(sub.status).toBe('inactive');
      expect(sub.stripeCustomerId).toBeNull();
      expect(sub.stripeSubscriptionId).toBeNull();
      expect(sub.currentPeriodEnd).toBeNull();
      expect(sub.createdAt).toBeInstanceOf(Date);
      expect(sub.updatedAt).toBeInstanceOf(Date);
    });

    it('persists provided Stripe fields on insert', () => {
      const userId = makeUser(handle, 'u2@example.com');
      const periodEnd = new Date('2030-01-01T00:00:00Z');
      const sub = createOrUpdateSubscription(handle.db, {
        userId,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_456',
        status: 'active',
        currentPeriodEnd: periodEnd,
      });

      expect(sub.stripeCustomerId).toBe('cus_123');
      expect(sub.stripeSubscriptionId).toBe('sub_456');
      expect(sub.status).toBe('active');
      expect(sub.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime());
    });

    it('updates the existing record on a second call for the same user', () => {
      const userId = makeUser(handle, 'u3@example.com');
      const first = createOrUpdateSubscription(handle.db, {
        userId,
        stripeCustomerId: 'cus_old',
      });
      const periodEnd = new Date('2031-06-01T00:00:00Z');
      const updated = createOrUpdateSubscription(handle.db, {
        userId,
        stripeCustomerId: 'cus_new',
        stripeSubscriptionId: 'sub_new',
        status: 'active',
        currentPeriodEnd: periodEnd,
      });

      expect(updated.id).toBe(first.id); // same row
      expect(updated.stripeCustomerId).toBe('cus_new');
      expect(updated.stripeSubscriptionId).toBe('sub_new');
      expect(updated.status).toBe('active');
      expect(updated.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime());
    });

    it('persists planId on insert and returns it', () => {
      const plan = upsertPlan(handle.db, {
        stripePriceId: 'price_123',
        displayName: 'Pro Monthly',
        interval: 'month',
        amountCents: 999,
        currency: 'usd',
        active: true,
      });
      const userId = makeUser(handle, 'u4@example.com');
      const sub = createOrUpdateSubscription(handle.db, {
        userId,
        planId: plan.id,
      });

      expect(sub.planId).toBe(plan.id);
      expect(getSubscriptionByUserId(handle.db, userId)?.planId).toBe(plan.id);
    });

    it('updates planId on upsert', () => {
      const firstPlan = upsertPlan(handle.db, {
        stripePriceId: 'price_first',
        displayName: 'First Plan',
        interval: 'month',
        amountCents: 499,
        currency: 'usd',
        active: true,
      });
      const secondPlan = upsertPlan(handle.db, {
        stripePriceId: 'price_second',
        displayName: 'Second Plan',
        interval: 'year',
        amountCents: 4999,
        currency: 'usd',
        active: true,
      });

      const userId = makeUser(handle, 'u5@example.com');
      createOrUpdateSubscription(handle.db, { userId, planId: firstPlan.id });
      const updated = createOrUpdateSubscription(handle.db, {
        userId,
        planId: secondPlan.id,
      });

      expect(updated.planId).toBe(secondPlan.id);
      expect(getSubscriptionByUserId(handle.db, userId)?.planId).toBe(secondPlan.id);
    });

    it('clears planId when upserted with null', () => {
      const plan = upsertPlan(handle.db, {
        stripePriceId: 'price_clear',
        displayName: 'Clearable Plan',
        interval: 'month',
        amountCents: 299,
        currency: 'usd',
        active: true,
      });

      const userId = makeUser(handle, 'u6@example.com');
      createOrUpdateSubscription(handle.db, { userId, planId: plan.id });
      const updated = createOrUpdateSubscription(handle.db, {
        userId,
        planId: null,
      });

      expect(updated.planId).toBeNull();
      expect(getSubscriptionByUserId(handle.db, userId)?.planId).toBeNull();
    });

    it('enforces one subscription per user via the unique constraint', () => {
      const userId = makeUser(handle, 'u7@example.com');
      createOrUpdateSubscription(handle.db, { userId });
      // A second direct insert with the same userId must violate the unique index.
      expect(() => handle.db.insert(subscriptions).values({ userId }).run()).toThrow();
    });
  });

  describe('getSubscriptionByUserId', () => {
    it('returns the subscription for the given user', () => {
      const userId = makeUser(handle, 'u5@example.com');
      const sub = createOrUpdateSubscription(handle.db, {
        userId,
        status: 'active',
      });
      expect(getSubscriptionByUserId(handle.db, userId)).toEqual(sub);
    });

    it('returns undefined when no subscription exists', () => {
      const userId = makeUser(handle, 'no-sub@example.com');
      expect(getSubscriptionByUserId(handle.db, userId)).toBeUndefined();
    });
  });
});

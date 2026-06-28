import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { subscriptions } from '../db/schema.js';
import { createUser } from './userRepository.js';
import {
  createOrUpdateSubscription,
  getSubscriptionByUserId,
} from './subscriptionRepository.js';

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

    it('enforces one subscription per user via the unique constraint', () => {
      const userId = makeUser(handle, 'u4@example.com');
      createOrUpdateSubscription(handle.db, { userId });
      // A second direct insert with the same userId must violate the unique index.
      expect(() =>
        handle.db.insert(subscriptions).values({ userId }).run(),
      ).toThrow();
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

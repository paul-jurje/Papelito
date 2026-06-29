import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import {
  getActivePlans,
  getPlanById,
  getPlanByStripePriceId,
  upsertPlan,
} from './planRepository.js';

function makePlanInput(overrides: Partial<Parameters<typeof upsertPlan>[1]> = {}) {
  return {
    stripePriceId: 'price_default',
    displayName: 'Default Plan',
    interval: 'month',
    amountCents: 1000,
    currency: 'eur',
    active: true,
    ...overrides,
  };
}

describe('planRepository', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  describe('upsertPlan', () => {
    it('inserts a new plan', () => {
      const plan = upsertPlan(
        handle.db,
        makePlanInput({
          stripePriceId: 'price_123',
          displayName: 'Monthly',
          interval: 'month',
          amountCents: 999,
          currency: 'usd',
          active: true,
        }),
      );

      expect(plan.id).toBeTypeOf('number');
      expect(plan.stripePriceId).toBe('price_123');
      expect(plan.displayName).toBe('Monthly');
      expect(plan.interval).toBe('month');
      expect(plan.amountCents).toBe(999);
      expect(plan.currency).toBe('usd');
      expect(plan.active).toBe(true);
      expect(plan.createdAt).toBeInstanceOf(Date);
      expect(plan.updatedAt).toBeInstanceOf(Date);
    });

    it('updates an existing plan by stripePriceId', () => {
      const first = upsertPlan(
        handle.db,
        makePlanInput({
          stripePriceId: 'price_456',
          displayName: 'Yearly',
          interval: 'year',
          amountCents: 5000,
        }),
      );

      const second = upsertPlan(
        handle.db,
        makePlanInput({
          stripePriceId: 'price_456',
          displayName: 'Yearly Pro',
          interval: 'year',
          amountCents: 7500,
          currency: 'gbp',
          active: false,
        }),
      );

      expect(second.id).toBe(first.id);
      expect(second.displayName).toBe('Yearly Pro');
      expect(second.amountCents).toBe(7500);
      expect(second.currency).toBe('gbp');
      expect(second.active).toBe(false);
      expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    });
  });

  describe('getActivePlans', () => {
    it('returns active plans ordered by amountCents ascending', () => {
      const expensive = upsertPlan(
        handle.db,
        makePlanInput({
          stripePriceId: 'price_expensive',
          amountCents: 5000,
        }),
      );
      const cheap = upsertPlan(
        handle.db,
        makePlanInput({
          stripePriceId: 'price_cheap',
          amountCents: 500,
        }),
      );

      const active = getActivePlans(handle.db);
      expect(active.map((p) => p.id)).toEqual([cheap.id, expensive.id]);
    });

    it('excludes inactive plans', () => {
      const active = upsertPlan(
        handle.db,
        makePlanInput({
          stripePriceId: 'price_active',
          active: true,
        }),
      );
      upsertPlan(
        handle.db,
        makePlanInput({
          stripePriceId: 'price_inactive',
          active: false,
        }),
      );

      const result = getActivePlans(handle.db);
      expect(result).toHaveLength(1);
      expect(result.map((p) => p.id)).toEqual([active.id]);
    });
  });

  describe('getPlanById', () => {
    it('returns the plan for a given id', () => {
      const plan = upsertPlan(handle.db, makePlanInput({ stripePriceId: 'price_by_id' }));

      expect(getPlanById(handle.db, plan.id)).toEqual(plan);
    });

    it('returns undefined when no plan exists', () => {
      expect(getPlanById(handle.db, 9999)).toBeUndefined();
    });
  });

  describe('getPlanByStripePriceId', () => {
    it('returns the plan for a given stripe price id', () => {
      const plan = upsertPlan(handle.db, makePlanInput({ stripePriceId: 'price_lookup' }));

      expect(getPlanByStripePriceId(handle.db, 'price_lookup')).toEqual(plan);
    });

    it('returns undefined when no plan exists', () => {
      expect(getPlanByStripePriceId(handle.db, 'price_nonexistent')).toBeUndefined();
    });
  });
});

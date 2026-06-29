import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { getPlanByStripePriceId } from '../repositories/planRepository.js';
import { syncPlansFromStripe } from './planSyncService.js';

interface PriceOptions {
  id?: string;
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  interval?: 'month' | 'year' | null;
  productName?: string | null;
}

function makePrice(opts: PriceOptions = {}): Stripe.Price {
  const {
    id = 'price_default',
    active = true,
    currency = 'eur',
    unit_amount = 599,
    interval = 'month',
    productName = 'Default Plan',
  } = opts;

  return {
    id,
    active,
    currency,
    unit_amount: unit_amount ?? undefined,
    recurring: interval ? { interval, interval_count: 1 } : undefined,
    product: productName ? ({ name: productName } as unknown as Stripe.Product) : undefined,
  } as unknown as Stripe.Price;
}

function createStripeStub(prices: Stripe.Price[]) {
  return {
    prices: {
      list: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield* prices;
        },
      }),
    },
  } as unknown as Stripe;
}

describe('planSyncService', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it('upserts active recurring prices with expanded products', async () => {
    const stripeStub = createStripeStub([
      makePrice({
        id: 'price_monthly',
        unit_amount: 599,
        interval: 'month',
        productName: 'Monthly Plan',
      }),
      makePrice({
        id: 'price_yearly',
        unit_amount: 5499,
        interval: 'year',
        productName: 'Yearly Plan',
      }),
    ]);

    const synced = await syncPlansFromStripe({
      stripeClient: stripeStub,
      db: handle.db,
    });

    expect(synced).toBe(2);
    expect(stripeStub.prices.list).toHaveBeenCalledWith({
      active: true,
      type: 'recurring',
      expand: ['data.product'],
    });

    const monthly = getPlanByStripePriceId(handle.db, 'price_monthly');
    expect(monthly).toMatchObject({
      stripePriceId: 'price_monthly',
      displayName: 'Monthly Plan',
      interval: 'month',
      amountCents: 599,
      currency: 'eur',
      active: true,
    });

    const yearly = getPlanByStripePriceId(handle.db, 'price_yearly');
    expect(yearly).toMatchObject({
      stripePriceId: 'price_yearly',
      displayName: 'Yearly Plan',
      interval: 'year',
      amountCents: 5499,
      currency: 'eur',
      active: true,
    });
  });

  it('updates existing plans when the Stripe price id already exists', async () => {
    const stripeStubFirst = createStripeStub([
      makePrice({
        id: 'price_existing',
        unit_amount: 599,
        interval: 'month',
        productName: 'Monthly Plan',
      }),
    ]);

    await syncPlansFromStripe({ stripeClient: stripeStubFirst, db: handle.db });
    const first = getPlanByStripePriceId(handle.db, 'price_existing');
    expect(first).toBeDefined();

    const stripeStubSecond = createStripeStub([
      makePrice({
        id: 'price_existing',
        unit_amount: 699,
        interval: 'year',
        productName: 'Updated Yearly Plan',
      }),
    ]);

    const synced = await syncPlansFromStripe({
      stripeClient: stripeStubSecond,
      db: handle.db,
    });

    expect(synced).toBe(1);
    const second = getPlanByStripePriceId(handle.db, 'price_existing');
    expect(second!.id).toBe(first!.id);
    expect(second).toMatchObject({
      displayName: 'Updated Yearly Plan',
      interval: 'year',
      amountCents: 699,
    });
  });

  it('derives a display name when the product name is unavailable', async () => {
    const stripeStub = createStripeStub([
      makePrice({
        id: 'price_derived',
        unit_amount: 1299,
        interval: 'month',
        productName: null,
      }),
    ]);

    await syncPlansFromStripe({ stripeClient: stripeStub, db: handle.db });

    const plan = getPlanByStripePriceId(handle.db, 'price_derived');
    expect(plan).toMatchObject({
      displayName: '12.99 EUR / month',
      amountCents: 1299,
    });
  });

  it('skips prices without a unit amount or recurring interval', async () => {
    const stripeStub = createStripeStub([
      makePrice({
        id: 'price_valid',
        unit_amount: 599,
        interval: 'month',
        productName: 'Valid Plan',
      }),
      makePrice({
        id: 'price_no_amount',
        unit_amount: null,
        interval: 'month',
        productName: 'No Amount',
      }),
      makePrice({
        id: 'price_no_interval',
        unit_amount: 599,
        interval: null,
        productName: 'No Interval',
      }),
    ]);

    const synced = await syncPlansFromStripe({
      stripeClient: stripeStub,
      db: handle.db,
    });

    expect(synced).toBe(1);
    expect(getPlanByStripePriceId(handle.db, 'price_valid')).toBeDefined();
    expect(getPlanByStripePriceId(handle.db, 'price_no_amount')).toBeUndefined();
    expect(getPlanByStripePriceId(handle.db, 'price_no_interval')).toBeUndefined();
  });
});

import type Stripe from 'stripe';
import { stripe } from '../lib/stripe.js';
import { db, type Db } from '../db/index.js';
import * as planRepository from '../repositories/planRepository.js';
import type { UpsertPlanInput } from '../types/index.js';

export interface SyncPlansDeps {
  stripeClient?: Stripe;
  db?: Db;
}

/**
 * Sync active recurring Stripe prices into the local `plans` table.
 *
 * Uses Stripe's auto-pagination so every page of prices is processed. Prices
 * without a unit amount or a recurring interval are skipped (they cannot be
 * presented as subscription plans).
 *
 * Returns the number of plans that were upserted.
 */
export async function syncPlansFromStripe(deps: SyncPlansDeps = {}): Promise<number> {
  const stripeClient = deps.stripeClient ?? stripe;
  const database = deps.db ?? db;

  let synced = 0;

  for await (const price of stripeClient.prices.list({
    active: true,
    type: 'recurring',
    expand: ['data.product'],
  })) {
    if (price.unit_amount == null) {
      continue;
    }
    if (!price.recurring?.interval) {
      continue;
    }

    const product =
      price.product && typeof price.product === 'object' && !('deleted' in price.product)
        ? (price.product as Stripe.Product)
        : null;

    const displayName =
      product?.name ??
      `${price.unit_amount / 100} ${price.currency.toUpperCase()} / ${price.recurring.interval}`;

    const input: UpsertPlanInput = {
      stripePriceId: price.id,
      displayName,
      interval: price.recurring.interval,
      amountCents: price.unit_amount,
      currency: price.currency,
      active: price.active,
    };

    planRepository.upsertPlan(database, input);
    synced += 1;
  }

  return synced;
}

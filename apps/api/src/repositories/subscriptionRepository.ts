import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { subscriptions, type DbSubscription } from '../db/schema.js';
import type { CreateOrUpdateSubscriptionInput, Subscription } from '../types/index.js';

function toSubscription(row: DbSubscription): Subscription {
  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createOrUpdateSubscription(
  db: Db,
  input: CreateOrUpdateSubscriptionInput,
): Subscription {
  const existing = db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, input.userId))
    .get();

  if (existing) {
    const updates: Partial<typeof subscriptions.$inferInsert> = {};
    if (input.planId !== undefined) updates.planId = input.planId;
    if (input.stripeCustomerId !== undefined) {
      updates.stripeCustomerId = input.stripeCustomerId;
    }
    if (input.stripeSubscriptionId !== undefined) {
      updates.stripeSubscriptionId = input.stripeSubscriptionId;
    }
    if (input.status !== undefined) updates.status = input.status;
    if (input.currentPeriodEnd !== undefined) {
      updates.currentPeriodEnd = input.currentPeriodEnd;
    }

    if (Object.keys(updates).length === 0) {
      return toSubscription(existing);
    }

    const row = db
      .update(subscriptions)
      .set(updates)
      .where(eq(subscriptions.userId, input.userId))
      .returning()
      .get();
    return toSubscription(row);
  }

  const row = db
    .insert(subscriptions)
    .values({
      userId: input.userId,
      planId: input.planId ?? null,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      status: input.status ?? 'inactive',
      currentPeriodEnd: input.currentPeriodEnd ?? null,
    })
    .returning()
    .get();
  return toSubscription(row);
}

export function getSubscriptionByUserId(db: Db, userId: number): Subscription | undefined {
  const row = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get();
  return row ? toSubscription(row) : undefined;
}

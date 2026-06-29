import { eq, asc } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { plans, type DbPlan } from '../db/schema.js';
import type { Plan, UpsertPlanInput } from '../types/index.js';

function toPlan(row: DbPlan): Plan {
  return {
    id: row.id,
    stripePriceId: row.stripePriceId,
    displayName: row.displayName,
    interval: row.interval,
    amountCents: row.amountCents,
    currency: row.currency,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function upsertPlan(db: Db, input: UpsertPlanInput): Plan {
  const row = db
    .insert(plans)
    .values({
      stripePriceId: input.stripePriceId,
      displayName: input.displayName,
      interval: input.interval,
      amountCents: input.amountCents,
      currency: input.currency,
      active: input.active,
    })
    .onConflictDoUpdate({
      target: plans.stripePriceId,
      set: {
        displayName: input.displayName,
        interval: input.interval,
        amountCents: input.amountCents,
        currency: input.currency,
        active: input.active,
      },
    })
    .returning()
    .get();
  return toPlan(row);
}

export function getActivePlans(db: Db): Plan[] {
  const rows = db
    .select()
    .from(plans)
    .where(eq(plans.active, true))
    .orderBy(asc(plans.amountCents))
    .all();
  return rows.map(toPlan);
}

export function getPlanById(db: Db, id: number): Plan | undefined {
  const row = db.select().from(plans).where(eq(plans.id, id)).get();
  return row ? toPlan(row) : undefined;
}

export function getPlanByStripePriceId(db: Db, stripePriceId: string): Plan | undefined {
  const row = db.select().from(plans).where(eq(plans.stripePriceId, stripePriceId)).get();
  return row ? toPlan(row) : undefined;
}

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) =>
  integer(name, { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`);

const autoUpdatedAt = (name: string) =>
  integer(name, { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date());

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  googleId: text('google_id').unique(),
  createdAt: timestamp('created_at'),
  updatedAt: autoUpdatedAt('updated_at'),
});

export const documents = sqliteTable('documents', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Untitled document'),
  content: text('content').notNull().default('{"type":"doc","content":[]}'),
  createdAt: timestamp('created_at'),
  updatedAt: autoUpdatedAt('updated_at'),
});

export const plans = sqliteTable('plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  stripePriceId: text('stripe_price_id').notNull().unique(),
  displayName: text('display_name').notNull(),
  interval: text('interval').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('eur'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at'),
  updatedAt: autoUpdatedAt('updated_at'),
});

export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  planId: integer('plan_id').references(() => plans.id, { onDelete: 'set null' }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: text('status').notNull().default('inactive'),
  currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),
  createdAt: timestamp('created_at'),
  updatedAt: autoUpdatedAt('updated_at'),
});

export const passwordResets = sqliteTable('password_resets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: autoUpdatedAt('updated_at'),
});

export type DbUser = typeof users.$inferSelect;
export type DbNewUser = typeof users.$inferInsert;
export type DbDocument = typeof documents.$inferSelect;
export type DbNewDocument = typeof documents.$inferInsert;
export type DbPlan = typeof plans.$inferSelect;
export type DbNewPlan = typeof plans.$inferInsert;
export type DbSubscription = typeof subscriptions.$inferSelect;
export type DbNewSubscription = typeof subscriptions.$inferInsert;
export type DbPasswordReset = typeof passwordResets.$inferSelect;
export type DbNewPasswordReset = typeof passwordResets.$inferInsert;

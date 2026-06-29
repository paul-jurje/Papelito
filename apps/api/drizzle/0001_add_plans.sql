CREATE TABLE `plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stripe_price_id` text NOT NULL,
	`display_name` text NOT NULL,
	`interval` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'eur' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_stripe_price_id_unique` ON `plans` (`stripe_price_id`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `plan_id` integer REFERENCES plans(id) ON DELETE SET NULL;
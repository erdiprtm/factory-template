CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`version` text NOT NULL,
	`granted_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `consents_user_idx` ON `consents` (`user_id`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`plan_id` text,
	`starts_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`payment_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entitlements_user_expires_idx` ON `entitlements` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_payment_unique` ON `entitlements` (`payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_one_trial_per_user` ON `entitlements` (`user_id`) WHERE source = 'trial';--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_ref` text,
	`plan_id` text NOT NULL,
	`amount_idr` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`paid_at` integer,
	`raw_payload` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_ref_unique` ON `payments` (`provider`,`provider_ref`);--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`);--> statement-breakpoint
CREATE INDEX `payments_status_expires_idx` ON `payments` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `reminders_sent` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entitlement_id` text NOT NULL,
	`kind` text NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_sent_entitlement_kind_unique` ON `reminders_sent` (`entitlement_id`,`kind`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_key` text NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_events_provider_key_unique` ON `webhook_events` (`provider`,`event_key`);
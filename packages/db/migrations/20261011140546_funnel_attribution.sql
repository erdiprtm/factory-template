CREATE TABLE `attributions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`anon_id` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`utm_content` text,
	`fbclid` text,
	`landing_path` text,
	`first_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attributions_user_unique` ON `attributions` (`user_id`);--> statement-breakpoint
CREATE INDEX `attributions_anon_idx` ON `attributions` (`anon_id`);--> statement-breakpoint
CREATE INDEX `attributions_utm_campaign_idx` ON `attributions` (`utm_campaign`);--> statement-breakpoint
CREATE TABLE `funnel_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`anon_id` text,
	`user_id` text,
	`step` integer,
	`utm_source` text,
	`utm_campaign` text,
	`value_idr` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `funnel_events_event_created_idx` ON `funnel_events` (`event`,`created_at`);--> statement-breakpoint
CREATE INDEX `funnel_events_campaign_created_idx` ON `funnel_events` (`utm_campaign`,`created_at`);--> statement-breakpoint
CREATE INDEX `funnel_events_anon_idx` ON `funnel_events` (`anon_id`);--> statement-breakpoint
CREATE INDEX `funnel_events_user_idx` ON `funnel_events` (`user_id`);--> statement-breakpoint
ALTER TABLE `payments` ADD `utm_source` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `utm_medium` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `utm_campaign` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `utm_content` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `fbclid` text;--> statement-breakpoint
CREATE INDEX `payments_utm_campaign_idx` ON `payments` (`utm_campaign`);
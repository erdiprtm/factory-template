CREATE TABLE `ad_spend` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`channel` text NOT NULL,
	`campaign` text NOT NULL,
	`amount_idr` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_spend_day_channel_campaign_unique` ON `ad_spend` (`day`,`channel`,`campaign`);--> statement-breakpoint
CREATE INDEX `ad_spend_day_idx` ON `ad_spend` (`day`);
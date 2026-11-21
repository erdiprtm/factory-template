CREATE TABLE `download_links` (
	`id` text PRIMARY KEY NOT NULL,
	`download_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`max_uses` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`download_id`) REFERENCES `downloads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `download_links_download_idx` ON `download_links` (`download_id`);--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`product_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `downloads_payment_unique` ON `downloads` (`payment_id`);--> statement-breakpoint
CREATE INDEX `downloads_email_idx` ON `downloads` (`email`);--> statement-breakpoint
ALTER TABLE `payments` ADD `buyer_email` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `checkout_origin` text;
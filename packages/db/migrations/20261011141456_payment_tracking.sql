CREATE TABLE `payment_tracking` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`fbp` text,
	`fbc` text,
	`client_ip` text,
	`user_agent` text,
	`source_url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_tracking_created_idx` ON `payment_tracking` (`created_at`);
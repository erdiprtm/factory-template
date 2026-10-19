CREATE TABLE `payment_charges` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`method` text NOT NULL,
	`fee_idr` integer NOT NULL,
	`total_idr` integer NOT NULL,
	`qr_string` text,
	`va_number` text,
	`provider_expires_at` integer NOT NULL,
	`is_sandbox` integer NOT NULL,
	`status_checked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `entitlements_source_expires_idx` ON `entitlements` (`source`,`expires_at`);--> statement-breakpoint
CREATE INDEX `payments_created_idx` ON `payments` (`created_at`);
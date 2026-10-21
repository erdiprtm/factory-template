ALTER TABLE `funnel_events` ADD `experiment` text;--> statement-breakpoint
ALTER TABLE `funnel_events` ADD `variant` text;--> statement-breakpoint
CREATE INDEX `funnel_events_experiment_created_idx` ON `funnel_events` (`experiment`,`created_at`);
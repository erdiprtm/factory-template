CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`feature` text NOT NULL,
	`model` text NOT NULL,
	`tier` text NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	`latency_ms` integer NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micro_usd` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_user_time_idx` ON `ai_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_time_idx` ON `ai_usage` (`created_at`);
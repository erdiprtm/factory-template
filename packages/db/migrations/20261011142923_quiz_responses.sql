CREATE TABLE `quiz_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`quiz_id` text NOT NULL,
	`answers` text NOT NULL,
	`completed_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_responses_user_quiz_unique` ON `quiz_responses` (`user_id`,`quiz_id`);
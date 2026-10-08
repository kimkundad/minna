CREATE TABLE `audit_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`actor_id` bigint unsigned,
	`actor_role` enum('superadmin','admin','teacher','student','system') NOT NULL,
	`actor_email` varchar(255),
	`action` varchar(64) NOT NULL,
	`subject_type` varchar(40),
	`subject_id` bigint unsigned,
	`summary` varchar(255),
	`changes` json,
	`ip` varchar(45),
	`user_agent` varchar(512),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacher_profiles` (
	`user_id` bigint unsigned NOT NULL,
	`display_name` varchar(150) NOT NULL,
	`short_name` varchar(100) NOT NULL,
	`headline` varchar(180),
	`bio` text,
	`languages` json,
	`credentials` text,
	`years_experience` smallint unsigned,
	`slug` varchar(150) NOT NULL,
	`listed` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_profiles_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `teacher_profiles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `roles` MODIFY COLUMN `name` enum('superadmin','admin','teacher','student') NOT NULL;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `remember` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `quiz_questions` ADD `image_path` varchar(512);--> statement-breakpoint
ALTER TABLE `quizzes` ADD `image_path` varchar(512);--> statement-breakpoint
ALTER TABLE `orders` ADD `order_coupon_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `teacher_applications` ADD `subject` varchar(150);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacher_profiles` ADD CONSTRAINT `teacher_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_subject_idx` ON `audit_logs` (`subject_type`,`subject_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_logs` (`action`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_order_coupon_id_coupons_id_fk` FOREIGN KEY (`order_coupon_id`) REFERENCES `coupons`(`id`) ON DELETE set null ON UPDATE no action;
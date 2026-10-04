CREATE TABLE `password_resets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `password_resets_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_resets_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`device_label` varchar(120),
	`ip` varchar(45),
	`user_agent` varchar(512),
	`expires_at` datetime NOT NULL,
	`revoked_at` datetime,
	`replaced_by` bigint unsigned,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `refresh_tokens_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` enum('admin','teacher','student') NOT NULL,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` bigint unsigned NOT NULL,
	`role_id` bigint unsigned NOT NULL,
	CONSTRAINT `user_roles_user_id_role_id_pk` PRIMARY KEY(`user_id`,`role_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`birthdate` date,
	`phone_country_code` varchar(8),
	`phone_national` varchar(32),
	`avatar_path` varchar(512),
	`locale` enum('th','en','jp','vn') NOT NULL DEFAULT 'th',
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`privacy_accepted_at` datetime,
	`email_verified_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`parent_id` bigint unsigned,
	`name` varchar(150) NOT NULL,
	`slug` varchar(150) NOT NULL,
	`icon` varchar(64),
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `course_documents` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`course_id` bigint unsigned NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_path` varchar(512) NOT NULL,
	`size_bytes` bigint unsigned,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `course_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `course_instructors` (
	`course_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`role` varchar(120),
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `course_instructors_course_id_user_id_pk` PRIMARY KEY(`course_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `course_modules` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`course_id` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `course_modules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`category_id` bigint unsigned,
	`title` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`short_desc` varchar(500),
	`description` text,
	`outcomes` json,
	`audience` json,
	`thumbnail_path` varchar(512),
	`sample_video_path` varchar(512),
	`level` enum('beginner','intermediate','advanced'),
	`content_locale` enum('th','en','jp','vn') NOT NULL DEFAULT 'th',
	`duration_seconds` int NOT NULL DEFAULT 0,
	`price` int NOT NULL DEFAULT 0,
	`normal_price` int,
	`access_type` enum('lifetime','limited') NOT NULL DEFAULT 'lifetime',
	`access_duration_days` smallint unsigned,
	`status` enum('draft','pending','approved','rejected','ended') NOT NULL DEFAULT 'draft',
	`sellable` boolean NOT NULL DEFAULT true,
	`repurchase` boolean NOT NULL DEFAULT true,
	`badge` enum('bestseller','recommended','new','free'),
	`popularity` int NOT NULL DEFAULT 0,
	`featured` boolean NOT NULL DEFAULT false,
	`published_at` datetime,
	`created_by` bigint unsigned,
	`approved_by` bigint unsigned,
	`approved_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`),
	CONSTRAINT `courses_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`course_id` bigint unsigned NOT NULL,
	`module_id` bigint unsigned,
	`type` enum('video','document','quiz') NOT NULL,
	`title` varchar(255) NOT NULL,
	`subtitle` varchar(255),
	`description` text,
	`duration_seconds` int NOT NULL DEFAULT 0,
	`video_path` varchar(512),
	`document_path` varchar(512),
	`is_preview` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `essay_reviews` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`submission_id` bigint unsigned NOT NULL,
	`version` int NOT NULL,
	`reviewer_id` bigint unsigned,
	`result` enum('passed','revision') NOT NULL,
	`comment` varchar(2000) NOT NULL,
	`attachment_path` varchar(512),
	`reviewed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `essay_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `essay_submissions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`quiz_id` bigint unsigned NOT NULL,
	`question_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`status` enum('pending','revision','resubmitted','passed') NOT NULL DEFAULT 'pending',
	`current_version` int NOT NULL DEFAULT 1,
	`submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`resolved_at` datetime,
	CONSTRAINT `essay_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `essay_submissions_unique` UNIQUE(`question_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `essay_versions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`submission_id` bigint unsigned NOT NULL,
	`version` int NOT NULL,
	`body` text NOT NULL,
	`attachment_path` varchar(512),
	`attachment_name` varchar(255),
	`size_bytes` bigint unsigned,
	`submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `essay_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `essay_versions_unique` UNIQUE(`submission_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `quiz_attempt_answers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`attempt_id` bigint unsigned NOT NULL,
	`question_id` bigint unsigned NOT NULL,
	`selected_choice_ids` json NOT NULL,
	`is_correct` boolean NOT NULL DEFAULT false,
	CONSTRAINT `quiz_attempt_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `quiz_attempt_answers_unique` UNIQUE(`attempt_id`,`question_id`)
);
--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`quiz_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`attempt_no` int NOT NULL DEFAULT 1,
	`score_pct` smallint unsigned,
	`passed` boolean NOT NULL DEFAULT false,
	`draft` json,
	`started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`submitted_at` datetime,
	CONSTRAINT `quiz_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `quiz_attempts_unique` UNIQUE(`quiz_id`,`user_id`,`attempt_no`)
);
--> statement-breakpoint
CREATE TABLE `quiz_choices` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`question_id` bigint unsigned NOT NULL,
	`text` varchar(500) NOT NULL,
	`is_correct` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `quiz_choices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quiz_questions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`quiz_id` bigint unsigned NOT NULL,
	`type` enum('single','multiple','essay') NOT NULL,
	`text` text NOT NULL,
	`max_length` int NOT NULL DEFAULT 1000,
	`attachment_allowed` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `quiz_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`course_id` bigint unsigned NOT NULL,
	`lesson_id` bigint unsigned,
	`title` varchar(255) NOT NULL,
	`pass_pct` smallint unsigned NOT NULL DEFAULT 80,
	`timer_minutes` smallint unsigned,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quizzes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quizzes_course_unique` UNIQUE(`course_id`)
);
--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`cart_id` bigint unsigned NOT NULL,
	`course_id` bigint unsigned,
	`package_id` bigint unsigned,
	`selected` boolean NOT NULL DEFAULT true,
	`coupon_id` bigint unsigned,
	`added_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `cart_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `cart_items_course_unique` UNIQUE(`cart_id`,`course_id`)
);
--> statement-breakpoint
CREATE TABLE `carts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned,
	`session_token` varchar(64),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `carts_id` PRIMARY KEY(`id`),
	CONSTRAINT `carts_user_unique` UNIQUE(`user_id`),
	CONSTRAINT `carts_session_unique` UNIQUE(`session_token`)
);
--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`coupon_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`discount_amount` int NOT NULL,
	`redeemed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `coupon_redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`scope` enum('course','order') NOT NULL,
	`course_id` bigint unsigned,
	`discount_type` enum('percent','fixed') NOT NULL,
	`value` int NOT NULL,
	`max_discount` int,
	`min_subtotal` int,
	`starts_at` datetime,
	`expires_at` datetime,
	`usage_limit` int,
	`used_count` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`course_id` bigint unsigned NOT NULL,
	`source` enum('purchase','package','free','admin') NOT NULL,
	`order_item_id` bigint unsigned,
	`subscription_id` bigint unsigned,
	`granted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expires_at` datetime,
	`status` enum('active','expired','revoked') NOT NULL DEFAULT 'active',
	CONSTRAINT `entitlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`type` enum('corporate','individual') NOT NULL,
	`name` varchar(255) NOT NULL,
	`tax_id` varchar(13) NOT NULL,
	`branch_type` enum('head','branch'),
	`branch_code` varchar(10),
	`address` text NOT NULL,
	`document_no` varchar(32),
	`issued_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_order_unique` UNIQUE(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`course_id` bigint unsigned,
	`package_id` bigint unsigned,
	`title_snapshot` varchar(255) NOT NULL,
	`unit_price` int NOT NULL,
	`discount` int NOT NULL DEFAULT 0,
	`coupon_id` bigint unsigned,
	`access_type` enum('lifetime','limited') NOT NULL DEFAULT 'lifetime',
	`access_duration_days` smallint unsigned,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_no` varchar(32) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`subtotal` int NOT NULL DEFAULT 0,
	`course_discount` int NOT NULL DEFAULT 0,
	`order_discount` int NOT NULL DEFAULT 0,
	`vat_amount` int NOT NULL DEFAULT 0,
	`total` int NOT NULL DEFAULT 0,
	`currency` varchar(3) NOT NULL DEFAULT 'THB',
	`status` enum('pending','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`payment_method` enum('card','promptpay','free'),
	`provider` varchar(32) NOT NULL DEFAULT 'stripe',
	`provider_ref` varchar(255),
	`provider_payload` json,
	`paid_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_no_unique` UNIQUE(`order_no`)
);
--> statement-breakpoint
CREATE TABLE `package_courses` (
	`package_id` bigint unsigned NOT NULL,
	`course_id` bigint unsigned NOT NULL,
	CONSTRAINT `package_courses_package_id_course_id_pk` PRIMARY KEY(`package_id`,`course_id`)
);
--> statement-breakpoint
CREATE TABLE `packages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`slug` varchar(150) NOT NULL,
	`description` text,
	`price` int NOT NULL DEFAULT 0,
	`duration_days` smallint unsigned NOT NULL DEFAULT 365,
	`benefits` json,
	`is_popular` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `packages_id` PRIMARY KEY(`id`),
	CONSTRAINT `packages_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`package_id` bigint unsigned NOT NULL,
	`order_id` bigint unsigned,
	`starts_at` datetime NOT NULL,
	`expires_at` datetime NOT NULL,
	`status` enum('active','expired','cancelled') NOT NULL DEFAULT 'active',
	`auto_renew` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lesson_notes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`lesson_id` bigint unsigned NOT NULL,
	`body` text NOT NULL,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lesson_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `lesson_notes_unique` UNIQUE(`user_id`,`lesson_id`)
);
--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`course_id` bigint unsigned NOT NULL,
	`lesson_id` bigint unsigned NOT NULL,
	`last_position_seconds` int NOT NULL DEFAULT 0,
	`max_position_seconds` int NOT NULL DEFAULT 0,
	`completed_at` datetime,
	`last_watched_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `lesson_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `lesson_progress_unique` UNIQUE(`user_id`,`lesson_id`)
);
--> statement-breakpoint
CREATE TABLE `lesson_questions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`lesson_id` bigint unsigned NOT NULL,
	`course_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`parent_id` bigint unsigned,
	`body` text NOT NULL,
	`is_instructor` boolean NOT NULL DEFAULT false,
	`answered_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `lesson_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`email` varchar(255) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`message` text,
	`read_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `contact_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`type` enum('purchase','expiry','essay_submitted','essay_reviewed','question_answered','welcome') NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` varchar(500),
	`cta_url` varchar(512),
	`read_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`excerpt` varchar(500),
	`cover_path` varchar(512),
	`content_html` text,
	`content_locale` enum('th','en','jp','vn') NOT NULL DEFAULT 'th',
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`published_at` datetime,
	`author_id` bigint unsigned,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `posts_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`group` varchar(50) NOT NULL DEFAULT 'general',
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`confirmed_at` datetime,
	`unsubscribed_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `subscribers_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscribers_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `teacher_applications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`email` varchar(255) NOT NULL,
	`phone` varchar(32),
	`category_id` bigint unsigned,
	`experience` text,
	`reason` text,
	`resume_path` varchar(512),
	`contact_time` varchar(120),
	`agreed_at` datetime,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`approved_by` bigint unsigned,
	`approved_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testimonials` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`designation` varchar(150),
	`content` text NOT NULL,
	`rating` tinyint unsigned NOT NULL DEFAULT 5,
	`avatar_path` varchar(512),
	`status` enum('draft','published') NOT NULL DEFAULT 'published',
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `testimonials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_categories_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_documents` ADD CONSTRAINT `course_documents_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_instructors` ADD CONSTRAINT `course_instructors_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_instructors` ADD CONSTRAINT `course_instructors_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_modules` ADD CONSTRAINT `course_modules_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_module_id_course_modules_id_fk` FOREIGN KEY (`module_id`) REFERENCES `course_modules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `essay_reviews` ADD CONSTRAINT `essay_reviews_submission_id_essay_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `essay_submissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `essay_reviews` ADD CONSTRAINT `essay_reviews_reviewer_id_users_id_fk` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `essay_submissions` ADD CONSTRAINT `essay_submissions_quiz_id_quizzes_id_fk` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `essay_submissions` ADD CONSTRAINT `essay_submissions_question_id_quiz_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `quiz_questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `essay_submissions` ADD CONSTRAINT `essay_submissions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `essay_versions` ADD CONSTRAINT `essay_versions_submission_id_essay_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `essay_submissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_attempt_answers` ADD CONSTRAINT `quiz_attempt_answers_attempt_id_quiz_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_attempt_answers` ADD CONSTRAINT `quiz_attempt_answers_question_id_quiz_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `quiz_questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_attempts` ADD CONSTRAINT `quiz_attempts_quiz_id_quizzes_id_fk` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_attempts` ADD CONSTRAINT `quiz_attempts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_choices` ADD CONSTRAINT `quiz_choices_question_id_quiz_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `quiz_questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_questions` ADD CONSTRAINT `quiz_questions_quiz_id_quizzes_id_fk` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quizzes` ADD CONSTRAINT `quizzes_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quizzes` ADD CONSTRAINT `quizzes_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_cart_id_carts_id_fk` FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_package_id_packages_id_fk` FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_coupon_id_coupons_id_fk` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `carts` ADD CONSTRAINT `carts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_redemptions` ADD CONSTRAINT `coupon_redemptions_coupon_id_coupons_id_fk` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_redemptions` ADD CONSTRAINT `coupon_redemptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_redemptions` ADD CONSTRAINT `coupon_redemptions_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entitlements` ADD CONSTRAINT `entitlements_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entitlements` ADD CONSTRAINT `entitlements_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entitlements` ADD CONSTRAINT `entitlements_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entitlements` ADD CONSTRAINT `entitlements_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_package_id_packages_id_fk` FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_coupon_id_coupons_id_fk` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `package_courses` ADD CONSTRAINT `package_courses_package_id_packages_id_fk` FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `package_courses` ADD CONSTRAINT `package_courses_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_package_id_packages_id_fk` FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_notes` ADD CONSTRAINT `lesson_notes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_notes` ADD CONSTRAINT `lesson_notes_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_progress` ADD CONSTRAINT `lesson_progress_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_progress` ADD CONSTRAINT `lesson_progress_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_progress` ADD CONSTRAINT `lesson_progress_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_questions` ADD CONSTRAINT `lesson_questions_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_questions` ADD CONSTRAINT `lesson_questions_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_questions` ADD CONSTRAINT `lesson_questions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_questions` ADD CONSTRAINT `lesson_questions_parent_id_lesson_questions_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `lesson_questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `posts` ADD CONSTRAINT `posts_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacher_applications` ADD CONSTRAINT `teacher_applications_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacher_applications` ADD CONSTRAINT `teacher_applications_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `password_resets_email_idx` ON `password_resets` (`email`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_expires_idx` ON `refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `user_roles_role_idx` ON `user_roles` (`role_id`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `course_documents_course_idx` ON `course_documents` (`course_id`);--> statement-breakpoint
CREATE INDEX `course_instructors_user_idx` ON `course_instructors` (`user_id`);--> statement-breakpoint
CREATE INDEX `course_modules_course_idx` ON `course_modules` (`course_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `courses_category_idx` ON `courses` (`category_id`);--> statement-breakpoint
CREATE INDEX `courses_status_idx` ON `courses` (`status`);--> statement-breakpoint
CREATE INDEX `courses_published_idx` ON `courses` (`published_at`);--> statement-breakpoint
CREATE INDEX `courses_price_idx` ON `courses` (`price`);--> statement-breakpoint
CREATE INDEX `lessons_course_idx` ON `lessons` (`course_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `lessons_module_idx` ON `lessons` (`module_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `essay_reviews_submission_idx` ON `essay_reviews` (`submission_id`,`version`);--> statement-breakpoint
CREATE INDEX `essay_submissions_status_idx` ON `essay_submissions` (`status`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `quiz_attempts_user_idx` ON `quiz_attempts` (`user_id`);--> statement-breakpoint
CREATE INDEX `quiz_choices_question_idx` ON `quiz_choices` (`question_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `quiz_questions_quiz_idx` ON `quiz_questions` (`quiz_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `cart_items_cart_idx` ON `cart_items` (`cart_id`);--> statement-breakpoint
CREATE INDEX `coupon_redemptions_coupon_idx` ON `coupon_redemptions` (`coupon_id`);--> statement-breakpoint
CREATE INDEX `coupon_redemptions_user_idx` ON `coupon_redemptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `coupons_scope_idx` ON `coupons` (`scope`,`active`);--> statement-breakpoint
CREATE INDEX `entitlements_user_course_idx` ON `entitlements` (`user_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `entitlements_status_idx` ON `entitlements` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `entitlements_course_idx` ON `entitlements` (`course_id`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_course_idx` ON `order_items` (`course_id`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_provider_ref_idx` ON `orders` (`provider_ref`);--> statement-breakpoint
CREATE INDEX `package_courses_course_idx` ON `package_courses` (`course_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_user_idx` ON `subscriptions` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_expires_idx` ON `subscriptions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `lesson_progress_course_idx` ON `lesson_progress` (`user_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `lesson_questions_lesson_idx` ON `lesson_questions` (`lesson_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `lesson_questions_course_idx` ON `lesson_questions` (`course_id`);--> statement-breakpoint
CREATE INDEX `lesson_questions_parent_idx` ON `lesson_questions` (`parent_id`);--> statement-breakpoint
CREATE INDEX `lesson_questions_pending_idx` ON `lesson_questions` (`answered_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_read_idx` ON `contact_messages` (`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_published_idx` ON `posts` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `posts_locale_idx` ON `posts` (`content_locale`);--> statement-breakpoint
CREATE INDEX `teacher_applications_status_idx` ON `teacher_applications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `testimonials_status_idx` ON `testimonials` (`status`,`sort_order`);
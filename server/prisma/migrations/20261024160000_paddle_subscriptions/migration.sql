CREATE TABLE `billing_subscriptions` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `paddle_subscription_id` VARCHAR(100) NOT NULL,
  `paddle_customer_id` VARCHAR(100) NULL,
  `plan` VARCHAR(30) NOT NULL,
  `status` VARCHAR(40) NOT NULL,
  `period_end` DATETIME(3) NULL,
  `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT false,
  `last_event_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `billing_subscriptions_user_id_key`(`user_id`),
  UNIQUE INDEX `billing_subscriptions_paddle_subscription_id_key`(`paddle_subscription_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `billing_checkouts` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `transaction_id` VARCHAR(100) NOT NULL,
  `plan` VARCHAR(30) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `billing_checkouts_transaction_id_key`(`transaction_id`),
  INDEX `billing_checkouts_user_id_created_at_idx`(`user_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `billing_webhook_events` (
  `event_id` VARCHAR(100) NOT NULL,
  `event_type` VARCHAR(80) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`event_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `monthly_render_usage` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `month` CHAR(7) NOT NULL,
  `used` INTEGER NOT NULL DEFAULT 0,
  UNIQUE INDEX `monthly_render_usage_user_id_month_key`(`user_id`,`month`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `render_credits` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `render_key` VARCHAR(255) NOT NULL,
  `month` CHAR(7) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `render_credits_user_id_render_key_key`(`user_id`,`render_key`),
  INDEX `render_credits_user_id_month_idx`(`user_id`,`month`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `billing_subscriptions` ADD CONSTRAINT `billing_subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `billing_checkouts` ADD CONSTRAINT `billing_checkouts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `monthly_render_usage` ADD CONSTRAINT `monthly_render_usage_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `render_credits` ADD CONSTRAINT `render_credits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

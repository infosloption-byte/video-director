-- Add state for resumable checkout and a durable one-at-a-time plan change lock.
ALTER TABLE `billing_checkouts`
  ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'awaiting_payment',
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE TABLE `billing_plan_changes` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `paddle_subscription_id` VARCHAR(100) NOT NULL,
  `from_plan` VARCHAR(30) NOT NULL,
  `to_plan` VARCHAR(30) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'processing',
  `last_error` VARCHAR(255) NULL,
  `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `billing_plan_changes_user_id_key`(`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `billing_plan_changes`
  ADD CONSTRAINT `billing_plan_changes_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `billing_checkout_locks` (
  `user_id` VARCHAR(191) NOT NULL,
  `plan` VARCHAR(30) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'creating',
  `transaction_id` VARCHAR(100) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `billing_checkout_locks`
  ADD CONSTRAINT `billing_checkout_locks_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `billing_checkouts`
  ADD COLUMN `last_event_at` DATETIME(3) NULL;

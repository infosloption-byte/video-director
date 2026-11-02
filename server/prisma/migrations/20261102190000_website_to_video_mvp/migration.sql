CREATE TABLE `website_analyses` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `url` VARCHAR(2048) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'queued',
  `progress` INTEGER NOT NULL DEFAULT 0,
  `stage` VARCHAR(120) NULL,
  `report` JSON NULL,
  `error` TEXT NULL,
  `project_id` VARCHAR(64) NULL,
  `created_videos` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  INDEX `website_analyses_user_id_created_at_idx` (`user_id`, `created_at`),
  INDEX `website_analyses_user_id_status_idx` (`user_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `website_analyses_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

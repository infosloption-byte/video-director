CREATE TABLE `project_versions` (
  `id` VARCHAR(191) NOT NULL,
  `project_id` VARCHAR(191) NOT NULL,
  `version_number` INTEGER NOT NULL,
  `label` VARCHAR(120) NOT NULL,
  `timeline` JSON NOT NULL,
  `created_by_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `project_versions_project_id_version_number_key` (`project_id`, `version_number`),
  INDEX `project_versions_project_id_created_at_idx` (`project_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `project_versions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `project_versions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_templates` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `timeline` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `project_templates_user_id_updated_at_idx` (`user_id`, `updated_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `project_templates_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_review_links` (
  `id` VARCHAR(191) NOT NULL,
  `project_id` VARCHAR(191) NOT NULL,
  `token` CHAR(48) NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `project_review_links_token_key` (`token`),
  INDEX `project_review_links_project_id_revoked_at_idx` (`project_id`, `revoked_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `project_review_links_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_review_comments` (
  `id` VARCHAR(191) NOT NULL,
  `review_link_id` VARCHAR(191) NOT NULL,
  `author_name` VARCHAR(120) NOT NULL,
  `body` TEXT NOT NULL,
  `resolved` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `project_review_comments_review_link_id_created_at_idx` (`review_link_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `project_review_comments_review_link_id_fkey` FOREIGN KEY (`review_link_id`) REFERENCES `project_review_links` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_activities` (
  `id` VARCHAR(191) NOT NULL,
  `project_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NULL,
  `action` VARCHAR(80) NOT NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `project_activities_project_id_created_at_idx` (`project_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `project_activities_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `project_activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

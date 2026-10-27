-- Admin-only simulated pipeline contracts, not production media generation.
CREATE TABLE `ai_pipeline_sandbox_tests` (
  `id` VARCHAR(64) NOT NULL,
  `pipeline_version_id` VARCHAR(64) NOT NULL,
  `actor_user_id` VARCHAR(191) NOT NULL,
  `definition_hash` VARCHAR(64) NOT NULL,
  `passed` BOOLEAN NOT NULL,
  `report` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ai_pipeline_sandbox_tests_version_created_idx` (`pipeline_version_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ai_pipeline_sandbox_tests_pipeline_version_id_fkey`
    FOREIGN KEY (`pipeline_version_id`) REFERENCES `ai_pipeline_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

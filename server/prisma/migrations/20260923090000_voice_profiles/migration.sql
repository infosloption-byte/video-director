CREATE TABLE `voice_profiles` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `language` VARCHAR(40) NOT NULL DEFAULT 'English',
  `preferred_engine` VARCHAR(60) NOT NULL,
  `status` ENUM('draft','processing','ready','failed','archived') NOT NULL DEFAULT 'draft',
  `tts_voice_id` VARCHAR(120) NULL,
  `sample_count` INTEGER NOT NULL DEFAULT 0,
  `consent_accepted_at` DATETIME(3) NULL,
  `reference_text` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `voice_profiles_tts_voice_id_key`(`tts_voice_id`),
  INDEX `voice_profiles_user_id_updated_at_idx`(`user_id`, `updated_at`),
  INDEX `voice_profiles_user_id_status_idx`(`user_id`, `status`),
  CONSTRAINT `voice_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_profile_samples` (
  `id` VARCHAR(191) NOT NULL,
  `profile_id` VARCHAR(191) NOT NULL,
  `sample_index` INTEGER NOT NULL,
  `prompt_text` TEXT NOT NULL,
  `storage_key` TEXT NOT NULL,
  `filename` VARCHAR(255) NULL,
  `mime_type` VARCHAR(120) NULL,
  `size_bytes` BIGINT NULL,
  `duration_seconds` DECIMAL(8,3) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'ready',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `voice_profile_samples_profile_id_sample_index_key`(`profile_id`, `sample_index`),
  INDEX `voice_profile_samples_profile_id_created_at_idx`(`profile_id`, `created_at`),
  CONSTRAINT `voice_profile_samples_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `voice_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `projects` ADD COLUMN `voice_profile_id` VARCHAR(191) NULL;
ALTER TABLE `projects`
  ADD CONSTRAINT `projects_voice_profile_id_fkey`
  FOREIGN KEY (`voice_profile_id`) REFERENCES `voice_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `projects_voice_profile_id_idx` ON `projects`(`voice_profile_id`);

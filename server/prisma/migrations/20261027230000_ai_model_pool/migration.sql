-- Admin-owned AI model pool. Secrets are encrypted by the API before storage.
CREATE TABLE `ai_pool_models` (
 `id` VARCHAR(64) NOT NULL,
 `name` VARCHAR(120) NOT NULL,
 `model_identifier` VARCHAR(120) NOT NULL,
 `hosting_type` VARCHAR(12) NOT NULL,
 `provider` VARCHAR(30) NOT NULL,
 `base_url` VARCHAR(512) NULL,
 `encrypted_credential` TEXT NULL,
 `declared_capabilities` JSON NOT NULL,
 `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
 `revision` INT NOT NULL DEFAULT 1,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updated_at` DATETIME(3) NOT NULL,
 INDEX `ai_pool_models_hosting_type_provider_idx` (`hosting_type`, `provider`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `ai_pool_capability_tests` (
 `id` VARCHAR(64) NOT NULL,
 `model_id` VARCHAR(64) NOT NULL,
 `capability` VARCHAR(30) NOT NULL,
 `model_revision` INT NOT NULL,
 `passed` BOOLEAN NOT NULL,
 `latency_ms` INT NOT NULL,
 `result` JSON NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX `ai_pool_capability_tests_model_id_capability_created_at_idx`(`model_id`, `capability`, `created_at`),
 PRIMARY KEY (`id`),
 CONSTRAINT `ai_pool_capability_tests_model_id_fkey`
 FOREIGN KEY (`model_id`) REFERENCES `ai_pool_models`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

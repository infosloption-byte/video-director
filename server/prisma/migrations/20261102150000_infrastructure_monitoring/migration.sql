CREATE TABLE `infrastructure_samples` (
  `id` VARCHAR(64) NOT NULL,
  `host` VARCHAR(35) NOT NULL,
  `source` VARCHAR(35) NOT NULL,
  `cpu_pct` DOUBLE NULL,
  `ram_used_bytes` BIGINT NULL,
  `ram_total_bytes` BIGINT NULL,
  `gpu_pct` DOUBLE NULL,
  `vram_used_bytes` BIGINT NULL,
  `vram_total_bytes` BIGINT NULL,
  `temperature_c` DOUBLE NULL,
  `collected_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `infrastructure_samples_host_collected_at_idx` (`host`, `collected_at`),
  INDEX `infrastructure_samples_created_at_idx` (`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

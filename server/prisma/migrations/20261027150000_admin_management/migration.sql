-- Configurable entitlements and platform master data; Paddle prices remain unchanged.
CREATE TABLE `platform_plan_limits` (
  `plan_id` VARCHAR(20) NOT NULL, `renders_per_month` INT NOT NULL,
  `max_seconds` INT NOT NULL, `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`plan_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `platform_settings` (
  `id` VARCHAR(20) NOT NULL DEFAULT 'global',
  `registration_open` BOOLEAN NOT NULL DEFAULT TRUE,
  `announcement` VARCHAR(240) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `platform_master_items` (
  `id` VARCHAR(191) NOT NULL, `category` VARCHAR(30) NOT NULL, 
  `code` VARCHAR(60) NOT NULL, `label` VARCHAR(100) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INT NOT NULL DEFAULT 0, `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `platform_master_items_category_code_key`(`category`, `code`),
  INDEX `platform_master_items_category_active_sort_order_idx`(`category`, `active`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `admin_audit_logs` ADD COLUMN `metadata` JSON NULL;
INSERT INTO `platform_master_items` (`id`,`category`,`code`,`label`,`active`,`sort_order`,`updated_at`) VALUES
  ('tone-energetic','tone','energetic','Energetic',TRUE,10,NOW(3)),
  ('tone-calm','tone','calm-authoritative','Calm & authoritative',TRUE,20,NOW(3)),
  ('tone-conversational','tone','conversational','Conversational',TRUE,30,NOW(3)),
  ('audience-general','audience','general-public','General public',TRUE,10,NOW(3)),
  ('audience-enthusiast','audience','enthusiast','Enthusiast',TRUE,20,NOW(3));

-- Add a least-privileged account role. Existing users remain regular users.
ALTER TABLE `users` ADD COLUMN `role` ENUM('user', 'platform_admin') NOT NULL DEFAULT 'user';

-- Initial admin grant actions are permanently recorded; no public role-grant API exists.
CREATE TABLE `admin_audit_logs` (
  `id` VARCHAR(191) NOT NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `target_user_id` VARCHAR(191) NULL,
  `action` VARCHAR(80) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `admin_audit_logs_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
  INDEX `admin_audit_logs_target_user_id_created_at_idx`(`target_user_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

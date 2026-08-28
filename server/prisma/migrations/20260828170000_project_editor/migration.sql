CREATE TABLE `project_editors` (
  `id` VARCHAR(191) NOT NULL,
  `project_id` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `timeline` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `project_editors_project_id_key` (`project_id`),
  CONSTRAINT `project_editors_project_id_fkey`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

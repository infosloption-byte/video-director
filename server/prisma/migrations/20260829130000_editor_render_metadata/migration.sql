ALTER TABLE `project_editors`
  ADD COLUMN `render_status` VARCHAR(32) NULL,
  ADD COLUMN `render_version` INT NULL,
  ADD COLUMN `render_hash` CHAR(64) NULL,
  ADD COLUMN `render_url` TEXT NULL,
  ADD COLUMN `render_error` TEXT NULL,
  ADD COLUMN `rendered_at` DATETIME(3) NULL;

CREATE INDEX `project_editors_render_status_idx` ON `project_editors`(`render_status`);

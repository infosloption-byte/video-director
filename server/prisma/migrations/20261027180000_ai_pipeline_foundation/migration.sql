-- Versioned AI pipeline definitions. Existing projects remain nullable and use the legacy flow.
CREATE TABLE `ai_pipelines` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_pipeline_versions` (
  `id` VARCHAR(64) NOT NULL,
  `pipeline_id` VARCHAR(64) NOT NULL,
  `version` INT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
  `definition` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `published_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ai_pipeline_versions_pipeline_id_version_key`(`pipeline_id`, `version`),
  INDEX `ai_pipeline_versions_status_idx`(`status`),
  CONSTRAINT `ai_pipeline_versions_pipeline_id_fkey` FOREIGN KEY (`pipeline_id`) REFERENCES `ai_pipelines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `active_ai_pipeline` (
  `id` VARCHAR(20) NOT NULL DEFAULT 'global',
  `version_id` VARCHAR(64) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `active_ai_pipeline_version_id_fkey` FOREIGN KEY (`version_id`) REFERENCES `ai_pipeline_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `projects` ADD COLUMN `pipeline_version_id` VARCHAR(64) NULL;
CREATE INDEX `projects_pipeline_version_id_idx` ON `projects`(`pipeline_version_id`);
ALTER TABLE `projects` ADD CONSTRAINT `projects_pipeline_version_id_fkey`
  FOREIGN KEY (`pipeline_version_id`) REFERENCES `ai_pipeline_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed a published immutable snapshot of today's proven workflow.
INSERT INTO `ai_pipelines` (`id`,`name`,`description`,`created_at`,`updated_at`)
  VALUES ('voxora-legacy','Voxora Classic','Existing Gemini, research verification, Pexels, user-selected TTS and Remotion workflow',NOW(3),NOW(3));
INSERT INTO `ai_pipeline_versions` (`id`,`pipeline_id`,`version`,`status`,`definition`,`created_at`,`published_at`)
  VALUES ('voxora-legacy-v1','voxora-legacy',1,'published','{"schemaVersion":1,"stages":[{"key":"topic","adapterId":"topic-manual"},{"key":"sources","adapterId":"source-cascade"},{"key":"research","adapterId":"gemini-research"},{"key":"verification","adapterId":"voxora-verification"},{"key":"storyboard","adapterId":"gemini-storyboard"},{"key":"visuals","adapterId":"pexels-stock"},{"key":"speech","adapterId":"tts-selected-voice"},{"key":"render","adapterId":"remotion-render"},{"key":"export","adapterId":"voxora-export"}]}',NOW(3),NOW(3));
INSERT INTO `active_ai_pipeline` (`id`,`version_id`,`updated_at`)
  VALUES ('global','voxora-legacy-v1',NOW(3));

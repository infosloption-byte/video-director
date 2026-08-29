ALTER TABLE `project_media`
  ADD COLUMN `proxy_url` TEXT NULL,
  ADD COLUMN `proxy_storage_key` TEXT NULL,
  ADD COLUMN `processing_error` TEXT NULL;

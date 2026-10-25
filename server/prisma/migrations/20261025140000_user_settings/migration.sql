-- Per-user settings (theme, notifications, etc.) and a readable label for each signed-in device.
ALTER TABLE `users` ADD COLUMN `preferences` JSON NULL;
ALTER TABLE `auth_sessions` ADD COLUMN `user_agent` VARCHAR(255) NULL;

-- DropIndex
DROP INDEX `project_exports_project_id_fkey` ON `project_exports`;

-- DropIndex
DROP INDEX `project_scenes_project_id_fkey` ON `project_scenes`;

-- DropIndex
DROP INDEX `projects_signal_id_fkey` ON `projects`;

-- DropIndex
DROP INDEX `scene_assets_scene_id_fkey` ON `scene_assets`;

-- AlterTable
ALTER TABLE `users` MODIFY `display_name` VARCHAR(191) NULL,
    ALTER COLUMN `updated_at` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_signal_id_fkey` FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_scenes` ADD CONSTRAINT `project_scenes_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scene_assets` ADD CONSTRAINT `scene_assets_scene_id_fkey` FOREIGN KEY (`scene_id`) REFERENCES `project_scenes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_exports` ADD CONSTRAINT `project_exports_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_tokens` ADD CONSTRAINT `auth_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

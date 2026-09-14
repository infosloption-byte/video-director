-- DropForeignKey
ALTER TABLE `project_exports` DROP FOREIGN KEY `project_exports_project_id_fkey`;

-- DropIndex
DROP INDEX `project_exports_project_id_fkey` ON `project_exports`;

-- DropForeignKey
ALTER TABLE `project_scenes` DROP FOREIGN KEY `project_scenes_project_id_fkey`;

-- DropIndex
DROP INDEX `project_scenes_project_id_fkey` ON `project_scenes`;

-- DropForeignKey
ALTER TABLE `projects` DROP FOREIGN KEY `projects_signal_id_fkey`;

-- DropIndex
DROP INDEX `projects_signal_id_fkey` ON `projects`;

-- DropForeignKey
ALTER TABLE `scene_assets` DROP FOREIGN KEY `scene_assets_scene_id_fkey`;

-- DropIndex
DROP INDEX `scene_assets_scene_id_fkey` ON `scene_assets`;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_signal_id_fkey` FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_scenes` ADD CONSTRAINT `project_scenes_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scene_assets` ADD CONSTRAINT `scene_assets_scene_id_fkey` FOREIGN KEY (`scene_id`) REFERENCES `project_scenes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_exports` ADD CONSTRAINT `project_exports_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
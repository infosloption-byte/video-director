/*
  Warnings:

  - You are about to drop the column `claim_text` on the `research_claims` table. All the data in the column will be lost.
  - You are about to drop the column `passage_text` on the `research_evidence` table. All the data in the column will be lost.
  - Added the required column `claimText` to the `research_claims` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passageText` to the `research_evidence` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `project_activities` DROP FOREIGN KEY `project_activities_user_id_fkey`;

-- DropIndex
DROP INDEX `project_activities_user_id_fkey` ON `project_activities`;

-- DropForeignKey
ALTER TABLE `project_exports` DROP FOREIGN KEY `project_exports_project_id_fkey`;

-- DropIndex
DROP INDEX `project_exports_project_id_fkey` ON `project_exports`;

-- DropForeignKey
ALTER TABLE `project_scenes` DROP FOREIGN KEY `project_scenes_project_id_fkey`;

-- DropIndex
DROP INDEX `project_scenes_project_id_fkey` ON `project_scenes`;

-- DropForeignKey
ALTER TABLE `project_versions` DROP FOREIGN KEY `project_versions_created_by_id_fkey`;

-- DropIndex
DROP INDEX `project_versions_created_by_id_fkey` ON `project_versions`;

-- DropForeignKey
ALTER TABLE `projects` DROP FOREIGN KEY `projects_signal_id_fkey`;

-- DropIndex
DROP INDEX `projects_signal_id_fkey` ON `projects`;

-- DropForeignKey
ALTER TABLE `research_conflicts` DROP FOREIGN KEY `research_conflicts_left_claim_id_fkey`;

-- DropIndex
DROP INDEX `research_conflicts_left_claim_id_fkey` ON `research_conflicts`;

-- DropForeignKey
ALTER TABLE `research_conflicts` DROP FOREIGN KEY `research_conflicts_right_claim_id_fkey`;

-- DropIndex
DROP INDEX `research_conflicts_right_claim_id_fkey` ON `research_conflicts`;

-- DropForeignKey
ALTER TABLE `scene_assets` DROP FOREIGN KEY `scene_assets_scene_id_fkey`;

-- DropIndex
DROP INDEX `scene_assets_scene_id_fkey` ON `scene_assets`;

-- AlterTable
ALTER TABLE `project_editors` MODIFY `render_status` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `research_claims` DROP COLUMN `claim_text`,
    ADD COLUMN `claimText` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `research_evidence` DROP COLUMN `passage_text`,
    ADD COLUMN `passageText` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `research_plans` MODIFY `session_id` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `research_verifications` MODIFY `claim_id` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_signal_id_fkey` FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_conflicts` ADD CONSTRAINT `research_conflicts_left_claim_id_fkey` FOREIGN KEY (`left_claim_id`) REFERENCES `research_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_conflicts` ADD CONSTRAINT `research_conflicts_right_claim_id_fkey` FOREIGN KEY (`right_claim_id`) REFERENCES `research_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_scenes` ADD CONSTRAINT `project_scenes_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scene_assets` ADD CONSTRAINT `scene_assets_scene_id_fkey` FOREIGN KEY (`scene_id`) REFERENCES `project_scenes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_exports` ADD CONSTRAINT `project_exports_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_versions` ADD CONSTRAINT `project_versions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_activities` ADD CONSTRAINT `project_activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the column `claim_text` on the `research_claims` table. All the data in the column will be lost.
  - You are about to drop the column `passage_text` on the `research_evidence` table. All the data in the column will be lost.
  - Added the required column `claimText` to the `research_claims` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passageText` to the `research_evidence` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `project_activities_user_id_fkey` ON `project_activities`;

-- DropIndex
DROP INDEX `project_exports_project_id_fkey` ON `project_exports`;

-- DropIndex
DROP INDEX `project_scenes_project_id_fkey` ON `project_scenes`;

-- DropIndex
DROP INDEX `project_versions_created_by_id_fkey` ON `project_versions`;

-- DropIndex
DROP INDEX `projects_signal_id_fkey` ON `projects`;

-- DropIndex
DROP INDEX `research_conflicts_left_claim_id_fkey` ON `research_conflicts`;

-- DropIndex
DROP INDEX `research_conflicts_right_claim_id_fkey` ON `research_conflicts`;

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
ALTER TABLE `research_sessions` ADD CONSTRAINT `research_sessions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_plans` ADD CONSTRAINT `research_plans_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_sources` ADD CONSTRAINT `research_sources_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_evidence` ADD CONSTRAINT `research_evidence_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_evidence` ADD CONSTRAINT `research_evidence_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_claims` ADD CONSTRAINT `research_claims_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_claim_sources` ADD CONSTRAINT `research_claim_sources_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `research_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_claim_sources` ADD CONSTRAINT `research_claim_sources_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_claim_evidence` ADD CONSTRAINT `research_claim_evidence_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `research_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_claim_evidence` ADD CONSTRAINT `research_claim_evidence_evidence_id_fkey` FOREIGN KEY (`evidence_id`) REFERENCES `research_evidence`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_verifications` ADD CONSTRAINT `research_verifications_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `research_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_conflicts` ADD CONSTRAINT `research_conflicts_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE `project_media` ADD CONSTRAINT `project_media_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_tokens` ADD CONSTRAINT `auth_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_editors` ADD CONSTRAINT `project_editors_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_versions` ADD CONSTRAINT `project_versions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_versions` ADD CONSTRAINT `project_versions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_templates` ADD CONSTRAINT `project_templates_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_review_links` ADD CONSTRAINT `project_review_links_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_review_comments` ADD CONSTRAINT `project_review_comments_review_link_id_fkey` FOREIGN KEY (`review_link_id`) REFERENCES `project_review_links`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_activities` ADD CONSTRAINT `project_activities_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_activities` ADD CONSTRAINT `project_activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `signals` (
    `id` VARCHAR(191) NOT NULL,
    `origin` ENUM('suggested', 'search') NOT NULL DEFAULT 'suggested',
    `source_type` ENUM('rss', 'hacker_news', 'arxiv', 'semantic_scholar', 'tavily', 'brave') NOT NULL,
    `source_reliability` ENUM('peer_reviewed', 'ai_search', 'general_web') NOT NULL,
    `search_query` VARCHAR(191) NULL,
    `rank` INTEGER NULL,
    `category` VARCHAR(191) NOT NULL,
    `heat_pct` VARCHAR(191) NULL,
    `heat_score` DECIMAL(6, 2) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `why_reasoning` TEXT NOT NULL,
    `source_name` VARCHAR(191) NULL,
    `source_url` TEXT NULL,
    `raw_content` LONGTEXT NULL,
    `status` ENUM('new', 'used', 'archived') NOT NULL DEFAULT 'new',
    `scraped_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `signal_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `research_summary` TEXT NULL,
    `research_sources` JSON NULL,
    `monetization_flags` JSON NULL,
    `script_length_seconds` INTEGER NULL,
    `suggested_length_seconds` INTEGER NULL,
    `selected_framework` VARCHAR(191) NULL,
    `framework_reasoning` TEXT NULL,
    `suggested_framework` VARCHAR(191) NULL,
    `tone` VARCHAR(191) NULL,
    `suggested_tone` VARCHAR(191) NULL,
    `audience_level` VARCHAR(191) NULL,
    `seo_caption` TEXT NULL,
    `duration_seconds` DECIMAL(5, 1) NULL,
    `cuts` INTEGER NULL,
    `status` ENUM('researching', 'setup', 'storyboard', 'finalize', 'rendering', 'published') NOT NULL DEFAULT 'researching',
    `render_url` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_scenes` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `scene_order` INTEGER NOT NULL,
    `title` VARCHAR(191) NULL,
    `spoken_text` TEXT NOT NULL,
    `duration_seconds` DECIMAL(4, 1) NULL,
    `why_line` TEXT NULL,
    `why_picture` TEXT NULL,
    `broll_search_term` VARCHAR(191) NULL,
    `audio_url` TEXT NULL,
    `word_timestamps` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scene_assets` (
    `id` VARCHAR(191) NOT NULL,
    `scene_id` VARCHAR(191) NOT NULL,
    `video_url` TEXT NOT NULL,
    `thumbnail_url` TEXT NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `is_selected` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_exports` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('mp4', 'srt', 'script_txt') NOT NULL,
    `file_url` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_signal_id_fkey` FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_scenes` ADD CONSTRAINT `project_scenes_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scene_assets` ADD CONSTRAINT `scene_assets_scene_id_fkey` FOREIGN KEY (`scene_id`) REFERENCES `project_scenes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_exports` ADD CONSTRAINT `project_exports_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

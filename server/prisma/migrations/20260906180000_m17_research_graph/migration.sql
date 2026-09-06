CREATE TABLE `research_sessions` (
  `id` VARCHAR(191) NOT NULL,
  `project_id` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `status` VARCHAR(40) NOT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `research_sessions_project_id_created_at_idx` (`project_id`, `created_at`),
  INDEX `research_sessions_project_id_status_idx` (`project_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `research_sessions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_plans` (
  `id` VARCHAR(191) NOT NULL,
  `session_id` VARCHAR(191) NOT NULL,
  `lanes` JSON NOT NULL,
  `queries_planned` INTEGER NOT NULL DEFAULT 0,
  `queries_run` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `research_plans_session_id_key` (`session_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `research_plans_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_sources` (
  `id` VARCHAR(191) NOT NULL,
  `session_id` VARCHAR(191) NOT NULL,
  `source_index` INTEGER NOT NULL,
  `url` TEXT NOT NULL,
  `canonical_url` TEXT NULL,
  `title` TEXT NULL,
  `publisher` VARCHAR(191) NULL,
  `source_class` VARCHAR(60) NULL,
  `reliability` VARCHAR(60) NULL,
  `published_at` DATETIME(3) NULL,
  `retrieved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `read_status` VARCHAR(30) NOT NULL,
  `read_excerpt` TEXT NULL,
  `content_hash` CHAR(64) NULL,
  `authority_score` INTEGER NULL,
  `relevance_score` INTEGER NULL,
  `evidence_score` INTEGER NULL,
  `recency_score` INTEGER NULL,
  `independence_score` INTEGER NULL,
  `transparency_score` INTEGER NULL,
  UNIQUE INDEX `research_sources_session_id_source_index_key` (`session_id`, `source_index`),
  INDEX `research_sources_session_id_read_status_idx` (`session_id`, `read_status`),
  INDEX `research_sources_session_id_source_class_idx` (`session_id`, `source_class`),
  PRIMARY KEY (`id`),
  CONSTRAINT `research_sources_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_evidence` (
  `id` VARCHAR(191) NOT NULL,
  `session_id` VARCHAR(191) NOT NULL,
  `source_id` VARCHAR(191) NOT NULL,
  `evidence_index` INTEGER NOT NULL,
  `passage_text` TEXT NOT NULL,
  `start_offset` INTEGER NULL,
  `end_offset` INTEGER NULL,
  `locator` VARCHAR(255) NULL,
  `evidence_type` VARCHAR(50) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `research_evidence_session_id_evidence_index_key` (`session_id`, `evidence_index`),
  INDEX `research_evidence_source_id_idx` (`source_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `research_evidence_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `research_evidence_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `research_sources` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_claims` (
  `id` VARCHAR(191) NOT NULL,
  `session_id` VARCHAR(191) NOT NULL,
  `claim_index` INTEGER NOT NULL,
  `claim_text` TEXT NOT NULL,
  `evidence_level` VARCHAR(50) NULL,
  `model_confidence` INTEGER NULL,
  `verified_confidence` INTEGER NULL,
  `verification_status` VARCHAR(40) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `research_claims_session_id_claim_index_key` (`session_id`, `claim_index`),
  INDEX `research_claims_session_id_verification_status_idx` (`session_id`, `verification_status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `research_claims_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_claim_sources` (
  `claim_id` VARCHAR(191) NOT NULL,
  `source_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`claim_id`, `source_id`),
  INDEX `research_claim_sources_source_id_idx` (`source_id`),
  CONSTRAINT `research_claim_sources_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `research_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `research_claim_sources_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `research_sources` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_claim_evidence` (
  `claim_id` VARCHAR(191) NOT NULL,
  `evidence_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`claim_id`, `evidence_id`),
  INDEX `research_claim_evidence_evidence_id_idx` (`evidence_id`),
  CONSTRAINT `research_claim_evidence_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `research_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `research_claim_evidence_evidence_id_fkey` FOREIGN KEY (`evidence_id`) REFERENCES `research_evidence` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_verifications` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `corroboration_score` INTEGER NOT NULL DEFAULT 0,
  `contradiction_score` INTEGER NOT NULL DEFAULT 0,
  `authority_score` INTEGER NOT NULL DEFAULT 0,
  `relevance_score` INTEGER NOT NULL DEFAULT 0,
  `evidence_quality_score` INTEGER NOT NULL DEFAULT 0,
  `recency_score` INTEGER NOT NULL DEFAULT 0,
  `independence_score` INTEGER NOT NULL DEFAULT 0,
  `transparency_score` INTEGER NOT NULL DEFAULT 0,
  `traceable` BOOLEAN NOT NULL DEFAULT false,
  `notes` TEXT NULL,
  `checked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `research_verifications_claim_id_key` (`claim_id`),
  INDEX `research_verifications_authority_score_idx` (`authority_score`),
  INDEX `research_verifications_corroboration_score_idx` (`corroboration_score`),
  PRIMARY KEY (`id`),
  CONSTRAINT `research_verifications_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `research_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_conflicts` (
  `id` VARCHAR(191) NOT NULL,
  `session_id` VARCHAR(191) NOT NULL,
  `left_claim_id` VARCHAR(191) NOT NULL,
  `right_claim_id` VARCHAR(191) NOT NULL,
  `overlap_score` INTEGER NOT NULL,
  `reason` TEXT NOT NULL,
  `resolution` TEXT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'open',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `research_conflicts_session_id_status_idx` (`session_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `research_conflicts_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `research_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `research_conflicts_left_claim_id_fkey` FOREIGN KEY (`left_claim_id`) REFERENCES `research_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `research_conflicts_right_claim_id_fkey` FOREIGN KEY (`right_claim_id`) REFERENCES `research_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tracks whether a new account has completed the post-verification plan step.
ALTER TABLE `users` ADD COLUMN `plan_selected_at` DATETIME(3) NULL;

-- Existing verified accounts are already using the product: do not send them through onboarding.
UPDATE `users` SET `plan_selected_at` = NOW(3) WHERE `email_verified_at` IS NOT NULL;

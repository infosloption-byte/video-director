-- Record explicit acknowledgement of the current terms and self-voice consent text.
-- Existing accounts and voice profiles remain nullable until asked to reaffirm.
ALTER TABLE `users`
  ADD COLUMN `terms_accepted_at` DATETIME(3) NULL,
  ADD COLUMN `terms_version` VARCHAR(30) NULL,
  ADD COLUMN `adult_confirmed_at` DATETIME(3) NULL;

ALTER TABLE `voice_profiles`
  ADD COLUMN `consent_notice_version` VARCHAR(30) NULL;

-- Preserve paid-plan intent through registration, email verification, and sign-in,
-- including verification links opened on a different browser/device.
ALTER TABLE `users`
  ADD COLUMN `intended_plan` VARCHAR(20) NULL;

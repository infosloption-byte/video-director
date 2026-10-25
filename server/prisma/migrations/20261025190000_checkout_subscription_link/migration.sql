-- A signed Paddle subscription.created event correlates its transaction_id
-- to the server-created checkout and records the subscription for verification.
ALTER TABLE `billing_checkouts`
  ADD COLUMN `paddle_subscription_id` VARCHAR(100) NULL;
CREATE INDEX `billing_checkouts_paddle_subscription_id_idx`
  ON `billing_checkouts` (`paddle_subscription_id`);

-- Store the exact model inference endpoint separately from the legacy hosted origin.
-- Nullable and additive for existing Model Pool records and their capability test history.
ALTER TABLE `ai_pool_models`
  ADD COLUMN `endpoint_url` VARCHAR(1024) NULL AFTER `base_url`;

UPDATE `ai_pool_models`
SET `endpoint_url` = CASE
  WHEN `provider` = 'openai' THEN 'https://api.openai.com/v1/chat/completions'
  WHEN `provider` = 'xai' THEN 'https://api.x.ai/v1/chat/completions'
  WHEN `provider` = 'openrouter' THEN 'https://openrouter.ai/api/v1/chat/completions'
  WHEN `provider` = 'gemini' THEN CONCAT(
    'https://generativelanguage.googleapis.com/v1beta/models/',
    REPLACE(REPLACE(`model_identifier`, '/', '%2F'), ':', '%3A'),
    ':generateContent'
  )
  WHEN `provider` = 'openai_compatible' AND `base_url` IS NOT NULL
    THEN CONCAT(TRIM(TRAILING '/' FROM `base_url`), '/v1/chat/completions')
  ELSE NULL
END
WHERE `endpoint_url` IS NULL;

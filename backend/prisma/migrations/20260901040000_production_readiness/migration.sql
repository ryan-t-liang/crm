ALTER TABLE `integration_outbox`
  ADD COLUMN `lock_owner` VARCHAR(64) NULL,
  ADD COLUMN `lease_until` DATETIME(3) NULL;

UPDATE `integration_outbox`
SET `lease_until` = COALESCE(`locked_at`, `updated_at`)
WHERE `status` = 'PROCESSING' AND `lease_until` IS NULL;

CREATE INDEX `integration_outbox_status_lease_until_idx`
  ON `integration_outbox`(`status`, `lease_until`);

ALTER TABLE `audit_logs`
  ADD COLUMN `user_agent` VARCHAR(500) NULL,
  ADD COLUMN `trace_id` VARCHAR(64) NULL;

UPDATE `audit_logs`
SET `trace_id` = `request_id`
WHERE `trace_id` IS NULL AND `request_id` IS NOT NULL;

CREATE INDEX `audit_logs_trace_id_idx` ON `audit_logs`(`trace_id`);

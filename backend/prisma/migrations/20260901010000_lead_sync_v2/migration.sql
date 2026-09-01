-- Remediation Round 1: align Lead dispatch, optional phone, sync states and attempt audit fields.
-- Preserve existing rows by widening the legacy enum before mapping values.
ALTER TABLE `leads`
  MODIFY `sync_status` VARCHAR(32) NOT NULL DEFAULT 'NOT_SYNCED',
  MODIFY `phone` VARCHAR(40) NULL;

UPDATE `leads`
SET `sync_status` = CASE `sync_status`
  WHEN 'NOT_SYNCED' THEN 'NOT_SYNCED'
  WHEN 'PENDING' THEN 'SYNC_PENDING'
  WHEN 'GATEWAY_QUEUED' THEN 'GATEWAY_ACCEPTED'
  WHEN 'SUCCEEDED' THEN 'GATEWAY_ACCEPTED'
  WHEN 'FAILED_PERMANENT' THEN 'DEAD_LETTER'
  WHEN 'FAILED_VALIDATION' THEN 'SYNC_FAILED'
  WHEN 'FAILED_AUTH' THEN 'SYNC_FAILED'
  WHEN 'FAILED' THEN 'SYNC_FAILED'
  ELSE 'SYNC_FAILED'
END;

-- Outbox is the authoritative source for legacy dead-letter deliveries.
UPDATE `leads` AS `lead`
INNER JOIN `integration_outbox` AS `outbox`
  ON `outbox`.`entity_type` = 'LEAD'
  AND `outbox`.`entity_id` = `lead`.`id`
  AND `outbox`.`integration` = 'SOWIND_GATEWAY'
SET `lead`.`sync_status` = 'DEAD_LETTER'
WHERE `outbox`.`status` = 'DEAD_LETTER';

ALTER TABLE `leads`
  MODIFY `sync_status` ENUM(
    'NOT_SYNCED',
    'SYNC_PENDING',
    'SYNCING',
    'GATEWAY_ACCEPTED',
    'SYNC_FAILED',
    'DEAD_LETTER'
  ) NOT NULL DEFAULT 'NOT_SYNCED';

ALTER TABLE `integration_outbox`
  ADD COLUMN `triggered_by` VARCHAR(32) NOT NULL DEFAULT 'AUTO' AFTER `last_error`;

ALTER TABLE `integration_attempts`
  ADD COLUMN `gateway_ref` VARCHAR(191) NULL AFTER `http_status`,
  ADD COLUMN `triggered_by` VARCHAR(32) NOT NULL DEFAULT 'AUTO' AFTER `gateway_ref`,
  ADD COLUMN `request_snapshot_json` JSON NULL AFTER `triggered_by`;

-- Existing outbox snapshots never include the runtime accessKey. Reuse them as the
-- sanitized legacy request snapshot and backfill accepted refs where possible.
UPDATE `integration_attempts` AS `attempt`
INNER JOIN `integration_outbox` AS `outbox` ON `outbox`.`id` = `attempt`.`outbox_id`
SET `attempt`.`request_snapshot_json` = `outbox`.`payload_snapshot_json`
WHERE `attempt`.`request_snapshot_json` IS NULL;

UPDATE `integration_attempts` AS `attempt`
INNER JOIN `leads` AS `lead` ON `lead`.`id` = `attempt`.`lead_id`
SET `attempt`.`gateway_ref` = `lead`.`gateway_ref`
WHERE `attempt`.`http_status` = 202
  AND `attempt`.`gateway_ref` IS NULL;

-- Keep existing active FormDefinition rows aligned with the new optional Lead phone validator.
UPDATE `form_definitions`
SET `schema_json` = JSON_SET(
  `schema_json`,
  REPLACE(
    JSON_UNQUOTE(JSON_SEARCH(`schema_json`, 'one', 'phone', NULL, '$.fields[*].key')),
    '.key',
    '.required'
  ),
  JSON_EXTRACT('false', '$')
)
WHERE `object_type` = 'LEAD'
  AND JSON_SEARCH(`schema_json`, 'one', 'phone', NULL, '$.fields[*].key') IS NOT NULL;

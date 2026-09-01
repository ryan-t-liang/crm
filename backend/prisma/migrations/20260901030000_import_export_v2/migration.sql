-- Remediation Round 3: non-destructive Import/Export lifecycle and audit contract.
ALTER TABLE `import_jobs`
  MODIFY `status` ENUM('PENDING','UPLOADED','PREFLIGHT_READY','READY_TO_EXECUTE','PROCESSING','COMPLETED','COMPLETED_WITH_ERRORS','PARTIAL','FAILED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `file_hash` CHAR(64) NULL AFTER `storage_path`,
  ADD COLUMN `mapping_json` JSON NULL AFTER `file_hash`,
  ADD COLUMN `result_json` JSON NULL AFTER `mapping_json`,
  ADD COLUMN `unmatched_strategy` VARCHAR(40) NULL AFTER `conflict_strategy`,
  ADD COLUMN `importable_count` INTEGER NOT NULL DEFAULT 0 AFTER `total_count`,
  ADD COLUMN `created_count` INTEGER NOT NULL DEFAULT 0 AFTER `skipped_count`,
  ADD COLUMN `updated_count` INTEGER NOT NULL DEFAULT 0 AFTER `created_count`,
  ADD COLUMN `failure_file_path` VARCHAR(500) NULL AFTER `updated_count`,
  ADD COLUMN `preflighted_at` DATETIME(3) NULL AFTER `created_at`,
  ADD COLUMN `processing_started_at` DATETIME(3) NULL AFTER `preflighted_at`,
  ADD INDEX `import_jobs_brand_id_object_type_file_hash_idx` (`brand_id`, `object_type`, `file_hash`);

ALTER TABLE `import_job_rows`
  ADD COLUMN `conflict_type` VARCHAR(64) NULL AFTER `status`,
  ADD COLUMN `normalized_data` JSON NULL AFTER `raw_data`,
  ADD COLUMN `warnings` JSON NULL AFTER `errors`,
  ADD COLUMN `resolved_customer_id` VARCHAR(32) NULL AFTER `warnings`,
  ADD COLUMN `resolved_profile_id` VARCHAR(32) NULL AFTER `resolved_customer_id`,
  ADD COLUMN `resolved_lead_id` VARCHAR(32) NULL AFTER `resolved_profile_id`;

ALTER TABLE `export_jobs`
  ADD COLUMN `scope` VARCHAR(32) NOT NULL DEFAULT 'ALL' AFTER `request_json`,
  ADD COLUMN `filter_json` JSON NULL AFTER `scope`,
  ADD COLUMN `selected_count` INTEGER NOT NULL DEFAULT 0 AFTER `filter_json`,
  ADD COLUMN `requested_fields` JSON NULL AFTER `selected_count`,
  ADD COLUMN `effective_fields` JSON NULL AFTER `requested_fields`,
  ADD COLUMN `brand_scope` JSON NULL AFTER `effective_fields`,
  ADD COLUMN `expires_at` DATETIME(3) NULL AFTER `completed_at`;

-- Preserve previous PARTIAL rows while aligning the formal result state.
UPDATE `import_jobs` SET `status` = 'COMPLETED_WITH_ERRORS' WHERE `status` = 'PARTIAL';

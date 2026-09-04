-- CRM 2.0 field alignment. Preserve existing Contact, Lead, followup, and attachment data.
ALTER TABLE `contacts`
  ADD COLUMN `followup_attention` TEXT NULL;

ALTER TABLE `crm_leads`
  ADD COLUMN `lead_source` VARCHAR(160) NULL,
  ADD COLUMN `collaboration_groups` TEXT NULL,
  ADD COLUMN `follow_mode` VARCHAR(160) NULL,
  ADD COLUMN `won_at` DATETIME(3) NULL,
  ADD COLUMN `delivery_followup_at` DATETIME(3) NULL,
  ADD COLUMN `contract_renewal_at` DATETIME(3) NULL,
  ADD COLUMN `payment_received_at` DATETIME(3) NULL,
  MODIFY COLUMN `technology_type` TEXT NULL,
  ADD INDEX `crm_leads_won_at_idx` (`won_at`);

CREATE TABLE `crm_lead_participants` (
  `lead_id` VARCHAR(32) NOT NULL,
  `user_id` VARCHAR(32) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `crm_lead_participants_user_id_created_at_idx` (`user_id`, `created_at`),
  PRIMARY KEY (`lead_id`, `user_id`),
  CONSTRAINT `crm_lead_participants_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `crm_lead_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Convert the already-introduced lead attachment table into the single generic CRM attachment table.
ALTER TABLE `lead_attachments`
  DROP FOREIGN KEY `lead_attachments_lead_id_fkey`,
  DROP FOREIGN KEY `lead_attachments_uploaded_by_user_id_fkey`;

RENAME TABLE `lead_attachments` TO `crm_attachments`;

ALTER TABLE `crm_attachments`
  DROP INDEX `lead_attachments_lead_id_created_at_idx`,
  DROP INDEX `lead_attachments_uploaded_by_user_id_created_at_idx`,
  CHANGE COLUMN `lead_id` `entity_id` VARCHAR(32) NOT NULL,
  CHANGE COLUMN `size_bytes` `file_size` INTEGER UNSIGNED NULL,
  CHANGE COLUMN `storage_path` `storage_key` VARCHAR(500) NULL,
  MODIFY COLUMN `mime_type` VARCHAR(191) NULL,
  MODIFY COLUMN `kind` ENUM('IMAGE', 'VIDEO', 'DOCUMENT') NULL,
  MODIFY COLUMN `file_hash` CHAR(64) NULL,
  ADD COLUMN `entity_type` ENUM('CONTACT', 'CONTACT_FOLLOWUP', 'LEAD', 'LEAD_FOLLOWUP') NOT NULL DEFAULT 'LEAD' AFTER `id`,
  ADD COLUMN `field_key` VARCHAR(80) NOT NULL DEFAULT 'requirementFiles' AFTER `entity_id`,
  ADD COLUMN `storage_type` ENUM('LOCAL', 'EXTERNAL_URL') NOT NULL DEFAULT 'LOCAL' AFTER `field_key`,
  ADD COLUMN `external_url` VARCHAR(2048) NULL AFTER `storage_key`,
  ADD INDEX `crm_attachments_entity_type_entity_id_field_key_created_at_idx` (`entity_type`, `entity_id`, `field_key`, `created_at`),
  ADD INDEX `crm_attachments_uploaded_by_user_id_created_at_idx` (`uploaded_by_user_id`, `created_at`),
  ADD INDEX `crm_attachments_created_at_idx` (`created_at`),
  ADD CONSTRAINT `crm_attachments_uploaded_by_user_id_fkey` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `crm_attachments`
  ALTER COLUMN `entity_type` DROP DEFAULT,
  ALTER COLUMN `field_key` DROP DEFAULT;

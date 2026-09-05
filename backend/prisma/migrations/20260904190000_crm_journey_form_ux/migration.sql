-- Additive migration for Customer 360, follow-up snapshots, and soft delete.
-- Existing CRM records, snapshot values, follow-ups, and legacy meeting files are preserved.

ALTER TABLE `contacts`
  ADD COLUMN `deleted_at` DATETIME(3) NULL,
  ADD COLUMN `deleted_by_user_id` VARCHAR(32) NULL,
  ADD INDEX `contacts_deleted_at_updated_at_idx` (`deleted_at`, `updated_at`),
  ADD INDEX `contacts_deleted_by_user_id_idx` (`deleted_by_user_id`),
  ADD CONSTRAINT `contacts_deleted_by_user_id_fkey`
    FOREIGN KEY (`deleted_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `contact_followups`
  ADD COLUMN `next_followup_at` DATETIME(3) NULL,
  ADD INDEX `contact_followups_contact_id_next_followup_at_idx` (`contact_id`, `next_followup_at`);

ALTER TABLE `crm_leads`
  ADD COLUMN `next_action` TEXT NULL,
  ADD COLUMN `image_requirement_note` TEXT NULL,
  ADD COLUMN `quotation_note` TEXT NULL,
  ADD COLUMN `deleted_at` DATETIME(3) NULL,
  ADD COLUMN `deleted_by_user_id` VARCHAR(32) NULL,
  ADD INDEX `crm_leads_deleted_at_updated_at_idx` (`deleted_at`, `updated_at`),
  ADD INDEX `crm_leads_deleted_by_user_id_idx` (`deleted_by_user_id`),
  ADD CONSTRAINT `crm_leads_deleted_by_user_id_fkey`
    FOREIGN KEY (`deleted_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `lead_followups`
  ADD COLUMN `progress` TEXT NULL,
  ADD COLUMN `next_action` TEXT NULL,
  ADD COLUMN `next_followup_at` DATETIME(3) NULL,
  ADD INDEX `lead_followups_lead_id_next_followup_at_idx` (`lead_id`, `next_followup_at`);

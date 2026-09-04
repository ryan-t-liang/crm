-- Make child timeline and attachment records lifecycle-bound to their parent CRM records.
ALTER TABLE `contact_followups` DROP FOREIGN KEY `contact_followups_contact_id_fkey`;
ALTER TABLE `lead_followups` DROP FOREIGN KEY `lead_followups_lead_id_fkey`;

ALTER TABLE `contact_followups`
  ADD CONSTRAINT `contact_followups_contact_id_fkey`
  FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `lead_followups`
  ADD CONSTRAINT `lead_followups_lead_id_fkey`
  FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `lead_attachments` (
  `id` VARCHAR(32) NOT NULL,
  `lead_id` VARCHAR(32) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(191) NOT NULL,
  `kind` ENUM('IMAGE', 'VIDEO', 'DOCUMENT') NOT NULL,
  `size_bytes` INTEGER UNSIGNED NOT NULL,
  `file_hash` CHAR(64) NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `uploaded_by_user_id` VARCHAR(32) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `lead_attachments_lead_id_created_at_idx`(`lead_id`, `created_at`),
  INDEX `lead_attachments_uploaded_by_user_id_created_at_idx`(`uploaded_by_user_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `lead_attachments`
  ADD CONSTRAINT `lead_attachments_lead_id_fkey`
  FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `lead_attachments`
  ADD CONSTRAINT `lead_attachments_uploaded_by_user_id_fkey`
  FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

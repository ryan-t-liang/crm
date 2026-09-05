-- Customer Operations & Management Expansion.
-- Additive only: existing contacts, leads, follow-ups, attachments, audit and import/export jobs are preserved.

ALTER TABLE `crm_attachments`
  MODIFY `entity_type` ENUM('ORGANIZATION', 'CONTACT', 'CONTACT_FOLLOWUP', 'LEAD', 'LEAD_FOLLOWUP') NOT NULL;

CREATE TABLE `organizations` (
  `id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(240) NOT NULL,
  `normalized_name` VARCHAR(240) NOT NULL,
  `short_name` VARCHAR(120) NULL,
  `website` VARCHAR(500) NULL,
  `website_domain` VARCHAR(191) NULL,
  `industry` VARCHAR(160) NULL,
  `country` VARCHAR(120) NULL,
  `region` VARCHAR(120) NULL,
  `city` VARCHAR(120) NULL,
  `owner_user_id` VARCHAR(32) NULL,
  `lifecycle_stage` ENUM('TARGET', 'CONTACTED', 'NURTURING', 'OPPORTUNITY', 'CUSTOMER', 'DISQUALIFIED') NOT NULL DEFAULT 'TARGET',
  `fit_score` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `fit_reason` TEXT NULL,
  `note` TEXT NULL,
  `created_by_user_id` VARCHAR(32) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  `deleted_by_user_id` VARCHAR(32) NULL,
  INDEX `organizations_normalized_name_idx` (`normalized_name`),
  INDEX `organizations_website_domain_idx` (`website_domain`),
  INDEX `organizations_owner_user_id_updated_at_idx` (`owner_user_id`, `updated_at`),
  INDEX `organizations_lifecycle_stage_updated_at_idx` (`lifecycle_stage`, `updated_at`),
  INDEX `organizations_fit_score_updated_at_idx` (`fit_score`, `updated_at`),
  INDEX `organizations_deleted_at_updated_at_idx` (`deleted_at`, `updated_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `organizations_fit_score_check` CHECK (`fit_score` BETWEEN 0 AND 100),
  CONSTRAINT `organizations_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `organizations_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `organizations_deleted_by_user_id_fkey` FOREIGN KEY (`deleted_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `organization_roles` (
  `organization_id` VARCHAR(32) NOT NULL,
  `role` ENUM('PROSPECT', 'CUSTOMER', 'VENDOR', 'PARTNER') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `organization_roles_role_created_at_idx` (`role`, `created_at`),
  PRIMARY KEY (`organization_id`, `role`),
  CONSTRAINT `organization_roles_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `organization_nurtures` (
  `id` VARCHAR(32) NOT NULL,
  `organization_id` VARCHAR(32) NOT NULL,
  `status` ENUM('ACTIVE', 'PAUSED', 'COMPLETED') NOT NULL DEFAULT 'ACTIVE',
  `owner_user_id` VARCHAR(32) NOT NULL,
  `reason` TEXT NOT NULL,
  `objective` TEXT NOT NULL,
  `cadence_days` SMALLINT UNSIGNED NOT NULL,
  `next_touch_at` DATETIME(3) NOT NULL,
  `touch_topic` VARCHAR(300) NOT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at` DATETIME(3) NULL,
  `created_by_user_id` VARCHAR(32) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `organization_nurtures_organization_id_status_next_touch_at_idx` (`organization_id`, `status`, `next_touch_at`),
  INDEX `organization_nurtures_owner_user_id_status_next_touch_at_idx` (`owner_user_id`, `status`, `next_touch_at`),
  INDEX `organization_nurtures_created_at_idx` (`created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `organization_nurtures_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `organization_nurtures_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `organization_nurtures_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `contacts`
  ADD COLUMN `organization_id` VARCHAR(32) NULL,
  ADD INDEX `contacts_organization_id_updated_at_idx` (`organization_id`, `updated_at`),
  ADD CONSTRAINT `contacts_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `contact_followups`
  ADD COLUMN `next_action` TEXT NULL;

ALTER TABLE `crm_leads`
  ADD COLUMN `closed_at` DATETIME(3) NULL,
  ADD INDEX `crm_leads_closed_at_idx` (`closed_at`);

CREATE TABLE `crm_tasks` (
  `id` VARCHAR(32) NOT NULL,
  `organization_id` VARCHAR(32) NULL,
  `contact_id` VARCHAR(32) NULL,
  `lead_id` VARCHAR(32) NULL,
  `title` VARCHAR(300) NOT NULL,
  `description` TEXT NULL,
  `owner_user_id` VARCHAR(32) NOT NULL,
  `priority` ENUM('NORMAL', 'HIGH') NOT NULL DEFAULT 'NORMAL',
  `due_at` DATETIME(3) NOT NULL,
  `status` ENUM('OPEN', 'DONE', 'CANCELED') NOT NULL DEFAULT 'OPEN',
  `source` ENUM('MANUAL', 'FOLLOWUP', 'NURTURE') NOT NULL DEFAULT 'MANUAL',
  `completed_at` DATETIME(3) NULL,
  `completed_by_user_id` VARCHAR(32) NULL,
  `created_by_user_id` VARCHAR(32) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `crm_tasks_organization_id_status_due_at_idx` (`organization_id`, `status`, `due_at`),
  INDEX `crm_tasks_contact_id_status_due_at_idx` (`contact_id`, `status`, `due_at`),
  INDEX `crm_tasks_lead_id_status_due_at_idx` (`lead_id`, `status`, `due_at`),
  INDEX `crm_tasks_owner_user_id_status_due_at_idx` (`owner_user_id`, `status`, `due_at`),
  INDEX `crm_tasks_status_due_at_idx` (`status`, `due_at`),
  INDEX `crm_tasks_source_created_at_idx` (`source`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `crm_tasks_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `crm_tasks_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `crm_tasks_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `crm_tasks_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `crm_tasks_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `crm_tasks_completed_by_user_id_fkey` FOREIGN KEY (`completed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_stage_history` (
  `id` VARCHAR(32) NOT NULL,
  `lead_id` VARCHAR(32) NOT NULL,
  `from_status` ENUM('NEW', 'QUALIFIED', 'SOLUTION', 'QUOTATION', 'WON', 'LOST') NULL,
  `to_status` ENUM('NEW', 'QUALIFIED', 'SOLUTION', 'QUOTATION', 'WON', 'LOST') NOT NULL,
  `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `changed_by_user_id` VARCHAR(32) NOT NULL,
  INDEX `lead_stage_history_lead_id_changed_at_idx` (`lead_id`, `changed_at`),
  INDEX `lead_stage_history_to_status_changed_at_idx` (`to_status`, `changed_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `lead_stage_history_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lead_stage_history_changed_by_user_id_fkey` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `organization_lifecycle_history` (
  `id` VARCHAR(32) NOT NULL,
  `organization_id` VARCHAR(32) NOT NULL,
  `from_stage` ENUM('TARGET', 'CONTACTED', 'NURTURING', 'OPPORTUNITY', 'CUSTOMER', 'DISQUALIFIED') NULL,
  `to_stage` ENUM('TARGET', 'CONTACTED', 'NURTURING', 'OPPORTUNITY', 'CUSTOMER', 'DISQUALIFIED') NOT NULL,
  `reason` VARCHAR(300) NULL,
  `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `changed_by_user_id` VARCHAR(32) NOT NULL,
  INDEX `organization_lifecycle_history_organization_id_changed_at_idx` (`organization_id`, `changed_at`),
  INDEX `organization_lifecycle_history_to_stage_changed_at_idx` (`to_stage`, `changed_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `organization_lifecycle_history_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `organization_lifecycle_history_changed_by_user_id_fkey` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Deterministic exact-name backfill only. No fuzzy merge is attempted.
INSERT INTO `organizations` (`id`, `name`, `normalized_name`, `short_name`, `website`, `industry`, `country`, `region`, `city`, `owner_user_id`, `created_by_user_id`, `created_at`, `updated_at`)
SELECT
  REPLACE(UUID(), '-', ''),
  MIN(c.`company_name`),
  LOWER(REGEXP_REPLACE(TRIM(c.`company_name`), '[[:space:]]+', ' ')),
  MIN(c.`company_short_name`),
  MIN(c.`website`),
  MIN(c.`industry`),
  MIN(c.`country`),
  MIN(c.`region`),
  MIN(c.`city`),
  CASE WHEN COUNT(DISTINCT c.`owner_user_id`) = 1 THEN MIN(c.`owner_user_id`) ELSE NULL END,
  MIN(c.`created_by_user_id`),
  MIN(c.`created_at`),
  MAX(c.`updated_at`)
FROM `contacts` c
WHERE c.`deleted_at` IS NULL AND c.`company_name` IS NOT NULL AND TRIM(c.`company_name`) <> ''
GROUP BY LOWER(REGEXP_REPLACE(TRIM(c.`company_name`), '[[:space:]]+', ' '));

INSERT INTO `organization_roles` (`organization_id`, `role`)
SELECT `id`, 'PROSPECT' FROM `organizations`;

UPDATE `contacts` c
JOIN `organizations` o ON o.`normalized_name` = LOWER(REGEXP_REPLACE(TRIM(c.`company_name`), '[[:space:]]+', ' '))
SET c.`organization_id` = o.`id`
WHERE c.`organization_id` IS NULL;

UPDATE `crm_leads`
SET `closed_at` = COALESCE(`won_at`, `updated_at`)
WHERE `status` IN ('WON', 'LOST') AND `closed_at` IS NULL;

INSERT INTO `lead_stage_history` (`id`, `lead_id`, `from_status`, `to_status`, `changed_at`, `changed_by_user_id`)
SELECT REPLACE(UUID(), '-', ''), `id`, NULL, `status`, `created_at`, `created_by_user_id`
FROM `crm_leads`;

INSERT INTO `organization_lifecycle_history` (`id`, `organization_id`, `from_stage`, `to_stage`, `reason`, `changed_at`, `changed_by_user_id`)
SELECT REPLACE(UUID(), '-', ''), `id`, NULL, `lifecycle_stage`, 'Deterministic legacy company backfill', `created_at`, `created_by_user_id`
FROM `organizations`;

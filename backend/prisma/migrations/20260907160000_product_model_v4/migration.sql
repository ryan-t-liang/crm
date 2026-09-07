-- Product model v4 additive migration.
-- Existing records, compatibility fields, attachments, jobs and histories are preserved.

ALTER TABLE `contacts`
  ADD COLUMN `contact_type` ENUM('BUSINESS', 'INDIVIDUAL') NOT NULL DEFAULT 'BUSINESS',
  ADD INDEX `contacts_contact_type_updated_at_idx` (`contact_type`, `updated_at`);

ALTER TABLE `organizations`
  ADD COLUMN `industry_code` VARCHAR(80) NULL,
  ADD COLUMN `industry_custom` VARCHAR(160) NULL,
  ADD COLUMN `region_code` VARCHAR(80) NULL,
  ADD COLUMN `city_code` VARCHAR(80) NULL,
  ADD COLUMN `city_custom` VARCHAR(120) NULL,
  ADD INDEX `organizations_industry_code_updated_at_idx` (`industry_code`, `updated_at`),
  ADD INDEX `organizations_country_code_region_code_city_code_idx` (`country_code`, `region_code`, `city_code`);

CREATE TABLE `assignment_notifications` (
  `id` VARCHAR(32) NOT NULL,
  `entity_type` VARCHAR(40) NOT NULL,
  `entity_id` VARCHAR(32) NOT NULL,
  `entity_label` VARCHAR(300) NOT NULL,
  `field_key` VARCHAR(80) NOT NULL,
  `from_user_id` VARCHAR(32) NULL,
  `to_user_id` VARCHAR(32) NOT NULL,
  `assigned_by_user_id` VARCHAR(32) NOT NULL,
  `recipient_email` VARCHAR(191) NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `last_error` VARCHAR(1000) NULL,
  `next_attempt_at` DATETIME(3) NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `assignment_notifications_status_next_attempt_at_created_at_idx` (`status`, `next_attempt_at`, `created_at`),
  INDEX `assignment_notifications_to_user_id_created_at_idx` (`to_user_id`, `created_at`),
  INDEX `assignment_notifications_entity_type_entity_id_created_at_idx` (`entity_type`, `entity_id`, `created_at`),
  CONSTRAINT `assignment_notifications_to_user_id_fkey` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `assignment_notifications_assigned_by_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- New leads start at zero. This fact-based rule gives users a legitimate way to
-- establish customer-profile fit without exposing a manual score input.
INSERT INTO `lead_scoring_rules`
  (`id`, `code`, `name`, `category`, `score_dimension`, `score_delta`, `repeatable`, `max_occurrences`, `cooldown_hours`, `enabled`, `sort_order`, `description`, `created_at`, `updated_at`)
SELECT
  REPLACE(UUID(), '-', ''), 'ICP_PROFILE_MATCH', '符合目标客户画像', 'QUALIFICATION', 'FIT', 40, false, 1, NULL, true, 45, '已确认客户画像与目标市场、行业或应用场景匹配', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `lead_scoring_rules` WHERE `code` = 'ICP_PROFILE_MATCH'
);

-- Product-language-only permission labels. Permission keys and grants remain unchanged.
UPDATE `permissions` SET `name` = '查看联系人' WHERE `key` = 'crm.contact.view';
UPDATE `permissions` SET `name` = '创建联系人' WHERE `key` = 'crm.contact.create';
UPDATE `permissions` SET `name` = '编辑联系人' WHERE `key` = 'crm.contact.edit';
UPDATE `permissions` SET `name` = '删除联系人' WHERE `key` = 'crm.contact.delete';
UPDATE `permissions` SET `name` = '导入联系人' WHERE `key` = 'crm.contact.import';
UPDATE `permissions` SET `name` = '导出联系人' WHERE `key` = 'crm.contact.export';

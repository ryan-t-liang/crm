-- Marketing Lead -> Opportunity implementation.
-- Additive only: existing organizations, contacts, opportunities, histories and jobs are preserved.

ALTER TABLE `contacts`
  ADD COLUMN `phone_normalized` VARCHAR(32) NULL,
  ADD COLUMN `whatsapp` VARCHAR(64) NULL,
  ADD COLUMN `whatsapp_normalized` VARCHAR(32) NULL,
  ADD INDEX `contacts_phone_normalized_idx` (`phone_normalized`),
  ADD INDEX `contacts_whatsapp_normalized_idx` (`whatsapp_normalized`);

ALTER TABLE `organizations`
  ADD COLUMN `country_code` CHAR(2) NULL,
  ADD COLUMN `company_size` VARCHAR(80) NULL;

CREATE TABLE `marketing_leads` (
  `id` VARCHAR(32) NOT NULL,
  `full_name` VARCHAR(160) NOT NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(64) NULL,
  `phone_normalized` VARCHAR(32) NULL,
  `whatsapp` VARCHAR(64) NULL,
  `whatsapp_normalized` VARCHAR(32) NULL,
  `wechat` VARCHAR(191) NULL,
  `linkedin_url` VARCHAR(500) NULL,
  `title` VARCHAR(160) NULL,
  `department` VARCHAR(160) NULL,
  `company_name` VARCHAR(240) NULL,
  `company_website` VARCHAR(500) NULL,
  `company_domain` VARCHAR(191) NULL,
  `company_size` VARCHAR(80) NULL,
  `industry` VARCHAR(160) NULL,
  `country_code` CHAR(2) NULL,
  `region` VARCHAR(120) NULL,
  `city` VARCHAR(120) NULL,
  `inquiry_type` VARCHAR(160) NULL,
  `inquiry_content` TEXT NULL,
  `product_interest` TEXT NULL,
  `requirement_tags` JSON NULL,
  `budget_range` VARCHAR(160) NULL,
  `note` TEXT NULL,
  `source` VARCHAR(40) NOT NULL,
  `source_channel` VARCHAR(120) NULL,
  `source_detail` VARCHAR(240) NULL,
  `first_touch_at` DATETIME(3) NULL,
  `status` ENUM('NEW', 'NURTURING', 'MQL', 'SQL', 'QUALIFIED', 'CONVERTED', 'RECYCLED', 'DISQUALIFIED') NOT NULL DEFAULT 'NEW',
  `owner_user_id` VARCHAR(32) NULL,
  `assigned_at` DATETIME(3) NULL,
  `mql_at` DATETIME(3) NULL,
  `sql_at` DATETIME(3) NULL,
  `qualified_at` DATETIME(3) NULL,
  `recycled_at` DATETIME(3) NULL,
  `converted_at` DATETIME(3) NULL,
  `disqualified_at` DATETIME(3) NULL,
  `disqualified_reason` TEXT NULL,
  `fit_score` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `fit_reason` TEXT NULL,
  `engagement_score_cached` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `engagement_score_calculated_at` DATETIME(3) NULL,
  `last_activity_at` DATETIME(3) NULL,
  `first_sales_response_at` DATETIME(3) NULL,
  `converted_organization_id` VARCHAR(32) NULL,
  `converted_contact_id` VARCHAR(32) NULL,
  `converted_opportunity_id` VARCHAR(32) NULL,
  `converted_by_user_id` VARCHAR(32) NULL,
  `created_by_user_id` VARCHAR(32) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  `deleted_by_user_id` VARCHAR(32) NULL,
  UNIQUE INDEX `marketing_leads_converted_opportunity_id_key` (`converted_opportunity_id`),
  INDEX `marketing_leads_status_created_at_idx` (`status`, `created_at`),
  INDEX `marketing_leads_owner_user_id_status_updated_at_idx` (`owner_user_id`, `status`, `updated_at`),
  INDEX `marketing_leads_source_created_at_idx` (`source`, `created_at`),
  INDEX `marketing_leads_email_idx` (`email`),
  INDEX `marketing_leads_phone_normalized_idx` (`phone_normalized`),
  INDEX `marketing_leads_whatsapp_normalized_idx` (`whatsapp_normalized`),
  INDEX `marketing_leads_company_domain_idx` (`company_domain`),
  INDEX `marketing_leads_converted_organization_id_idx` (`converted_organization_id`),
  INDEX `marketing_leads_converted_contact_id_idx` (`converted_contact_id`),
  INDEX `marketing_leads_converted_by_user_id_idx` (`converted_by_user_id`),
  INDEX `marketing_leads_deleted_at_updated_at_idx` (`deleted_at`, `updated_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `marketing_leads_fit_score_check` CHECK (`fit_score` BETWEEN 0 AND 100),
  CONSTRAINT `marketing_leads_engagement_score_check` CHECK (`engagement_score_cached` BETWEEN 0 AND 100),
  CONSTRAINT `marketing_leads_country_code_check` CHECK (`country_code` IS NULL OR `country_code` REGEXP '^[A-Z]{2}$'),
  CONSTRAINT `marketing_leads_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `marketing_leads_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `marketing_leads_deleted_by_user_id_fkey` FOREIGN KEY (`deleted_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `marketing_leads_converted_by_user_id_fkey` FOREIGN KEY (`converted_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `marketing_leads_converted_organization_id_fkey` FOREIGN KEY (`converted_organization_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `marketing_leads_converted_contact_id_fkey` FOREIGN KEY (`converted_contact_id`) REFERENCES `contacts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `marketing_leads_converted_opportunity_id_fkey` FOREIGN KEY (`converted_opportunity_id`) REFERENCES `crm_leads` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `crm_leads`
  ADD COLUMN `requirement_context` VARCHAR(160) NULL,
  ADD COLUMN `product_interest` TEXT NULL,
  ADD COLUMN `requirement_tags` JSON NULL,
  ADD COLUMN `source_marketing_lead_id` VARCHAR(32) NULL,
  ADD UNIQUE INDEX `crm_leads_source_marketing_lead_id_key` (`source_marketing_lead_id`),
  ADD CONSTRAINT `crm_leads_source_marketing_lead_id_fkey` FOREIGN KEY (`source_marketing_lead_id`) REFERENCES `marketing_leads` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `lead_scoring_rules` (
  `id` VARCHAR(32) NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `category` VARCHAR(80) NOT NULL,
  `score_dimension` ENUM('FIT', 'ENGAGEMENT') NOT NULL,
  `score_delta` SMALLINT NOT NULL,
  `repeatable` BOOLEAN NOT NULL DEFAULT true,
  `max_occurrences` SMALLINT UNSIGNED NULL,
  `cooldown_hours` SMALLINT UNSIGNED NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `description` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `lead_scoring_rules_code_key` (`code`),
  INDEX `lead_scoring_rules_enabled_sort_order_idx` (`enabled`, `sort_order`),
  INDEX `lead_scoring_rules_score_dimension_enabled_idx` (`score_dimension`, `enabled`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_activity_events` (
  `id` VARCHAR(32) NOT NULL,
  `marketing_lead_id` VARCHAR(32) NOT NULL,
  `scoring_rule_id` VARCHAR(32) NULL,
  `event_type` VARCHAR(80) NOT NULL,
  `source` ENUM('WEB', 'CRM', 'SYSTEM', 'IMPORT', 'CAMPAIGN', 'EVENT') NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `actor_user_id` VARCHAR(32) NULL,
  `note` TEXT NULL,
  `engagement_delta_snapshot` SMALLINT NOT NULL DEFAULT 0,
  `fit_delta_snapshot` SMALLINT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `lead_activity_events_marketing_lead_id_occurred_at_idx` (`marketing_lead_id`, `occurred_at`),
  INDEX `lead_activity_events_scoring_rule_id_occurred_at_idx` (`scoring_rule_id`, `occurred_at`),
  INDEX `lead_activity_events_event_type_occurred_at_idx` (`event_type`, `occurred_at`),
  INDEX `lead_activity_events_actor_user_id_occurred_at_idx` (`actor_user_id`, `occurred_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `lead_activity_events_marketing_lead_id_fkey` FOREIGN KEY (`marketing_lead_id`) REFERENCES `marketing_leads` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `lead_activity_events_scoring_rule_id_fkey` FOREIGN KEY (`scoring_rule_id`) REFERENCES `lead_scoring_rules` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `lead_activity_events_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_score_history` (
  `id` VARCHAR(32) NOT NULL,
  `marketing_lead_id` VARCHAR(32) NOT NULL,
  `activity_event_id` VARCHAR(32) NULL,
  `dimension` ENUM('FIT', 'ENGAGEMENT') NOT NULL,
  `previous_score` TINYINT UNSIGNED NOT NULL,
  `score_delta` SMALLINT NOT NULL,
  `new_score` TINYINT UNSIGNED NOT NULL,
  `reason` VARCHAR(300) NULL,
  `changed_by_user_id` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `lead_score_history_marketing_lead_id_created_at_idx` (`marketing_lead_id`, `created_at`),
  INDEX `lead_score_history_activity_event_id_idx` (`activity_event_id`),
  INDEX `lead_score_history_dimension_created_at_idx` (`dimension`, `created_at`),
  INDEX `lead_score_history_changed_by_user_id_created_at_idx` (`changed_by_user_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `lead_score_history_marketing_lead_id_fkey` FOREIGN KEY (`marketing_lead_id`) REFERENCES `marketing_leads` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `lead_score_history_activity_event_id_fkey` FOREIGN KEY (`activity_event_id`) REFERENCES `lead_activity_events` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `lead_score_history_changed_by_user_id_fkey` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_status_history` (
  `id` VARCHAR(32) NOT NULL,
  `marketing_lead_id` VARCHAR(32) NOT NULL,
  `from_status` ENUM('NEW', 'NURTURING', 'MQL', 'SQL', 'QUALIFIED', 'CONVERTED', 'RECYCLED', 'DISQUALIFIED') NULL,
  `to_status` ENUM('NEW', 'NURTURING', 'MQL', 'SQL', 'QUALIFIED', 'CONVERTED', 'RECYCLED', 'DISQUALIFIED') NOT NULL,
  `reason` VARCHAR(500) NULL,
  `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `changed_by_user_id` VARCHAR(32) NOT NULL,
  INDEX `lead_status_history_marketing_lead_id_changed_at_idx` (`marketing_lead_id`, `changed_at`),
  INDEX `lead_status_history_to_status_changed_at_idx` (`to_status`, `changed_at`),
  INDEX `lead_status_history_changed_by_user_id_changed_at_idx` (`changed_by_user_id`, `changed_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `lead_status_history_marketing_lead_id_fkey` FOREIGN KEY (`marketing_lead_id`) REFERENCES `marketing_leads` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `lead_status_history_changed_by_user_id_fkey` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `lead_scoring_rules` (`id`, `code`, `name`, `category`, `score_dimension`, `score_delta`, `repeatable`, `max_occurrences`, `cooldown_hours`, `enabled`, `sort_order`, `description`, `updated_at`)
VALUES
  (REPLACE(UUID(), '-', ''), 'PAGE_VIEW', '页面浏览', 'DIGITAL', 'ENGAGEMENT', 1, true, NULL, 1, true, 10, '普通页面浏览', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'KEY_CONTENT_VIEW', '关键内容浏览', 'DIGITAL', 'ENGAGEMENT', 3, true, NULL, 12, true, 20, '案例、产品或方案等关键内容浏览', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'RETURN_VISIT', '再次访问', 'DIGITAL', 'ENGAGEMENT', 3, true, NULL, 12, true, 30, '访客再次回访', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'FILE_DOWNLOAD', '文件下载', 'DIGITAL', 'ENGAGEMENT', 5, true, 10, 1, true, 40, '下载产品或方案文件', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'FORM_SUBMIT', '提交表单', 'CONVERSION', 'ENGAGEMENT', 10, false, 1, NULL, true, 50, '提交营销表单', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'CUSTOMER_REPLY', '客户回复', 'SALES', 'ENGAGEMENT', 5, true, NULL, NULL, true, 60, '客户通过任一渠道回复', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'WECHAT_ADDED', '已添加微信', 'SALES', 'ENGAGEMENT', 5, false, 1, NULL, true, 70, '已建立微信联系', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'MEETING_BOOKED', '预约会议', 'SALES', 'ENGAGEMENT', 10, true, NULL, NULL, true, 80, '客户同意会议时间', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'MEETING_COMPLETED', '完成会议', 'SALES', 'ENGAGEMENT', 15, true, NULL, NULL, true, 90, '会议已实际完成', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'EXPLICIT_INTEREST', '明确兴趣', 'QUALIFICATION', 'ENGAGEMENT', 15, true, 3, NULL, true, 100, '客户明确表达兴趣', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'EXPLICIT_REQUIREMENT', '明确需求', 'QUALIFICATION', 'ENGAGEMENT', 20, true, 3, NULL, true, 110, '客户明确说明业务需求', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'REQUEST_SOLUTION', '要求方案', 'QUALIFICATION', 'ENGAGEMENT', 20, true, 3, NULL, true, 120, '客户要求正式方案', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'NO_TIMING', '暂无时机', 'NEGATIVE', 'ENGAGEMENT', -5, true, NULL, 24, true, 130, '当前没有合适时机', CURRENT_TIMESTAMP(3)),
  (REPLACE(UUID(), '-', ''), 'NO_INTEREST', '无兴趣', 'NEGATIVE', 'ENGAGEMENT', -20, true, NULL, 24, true, 140, '客户明确表示无兴趣', CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `category` = VALUES(`category`),
  `score_dimension` = VALUES(`score_dimension`),
  `score_delta` = VALUES(`score_delta`),
  `repeatable` = VALUES(`repeatable`),
  `max_occurrences` = VALUES(`max_occurrences`),
  `cooldown_hours` = VALUES(`cooldown_hours`),
  `sort_order` = VALUES(`sort_order`),
  `description` = VALUES(`description`);

INSERT INTO `permissions` (`id`, `key`, `name`, `module`)
VALUES
  (REPLACE(UUID(), '-', ''), 'crm.marketing_lead.view', '查看线索', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing_lead.create', '创建线索', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing_lead.edit', '编辑线索', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing_lead.assign', '分配线索', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing_lead.qualify', '确认线索资格', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing_lead.convert', '线索转商机', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing_lead.delete', '删除线索', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing_lead.import', '导入线索', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing_lead.export', '导出线索', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing.activity.create', '记录线索行为', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing.score_rule.view', '查看评分规则', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing.score_rule.manage', '管理评分规则', 'crm_marketing'),
  (REPLACE(UUID(), '-', ''), 'crm.marketing.analytics.view', '查看营销分析', 'crm_marketing')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `module` = VALUES(`module`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
CROSS JOIN `permissions` p
WHERE
  (r.`key` = 'SUPER_ADMIN' AND p.`key` LIKE 'crm.marketing.%')
  OR (r.`key` = 'SUPER_ADMIN' AND p.`key` LIKE 'crm.marketing_lead.%')
  OR (r.`key` = 'SALES' AND p.`key` IN (
    'crm.marketing_lead.view', 'crm.marketing_lead.create', 'crm.marketing_lead.edit',
    'crm.marketing_lead.assign', 'crm.marketing_lead.qualify', 'crm.marketing_lead.convert',
    'crm.marketing_lead.import', 'crm.marketing_lead.export',
    'crm.marketing.activity.create', 'crm.marketing.score_rule.view', 'crm.marketing.analytics.view'
  ))
  OR (r.`key` = 'VIEWER' AND p.`key` IN ('crm.marketing_lead.view', 'crm.marketing.score_rule.view'));

UPDATE `permissions`
SET `name` = CASE `key`
  WHEN 'crm.lead.view' THEN '查看商机'
  WHEN 'crm.lead.create' THEN '创建商机'
  WHEN 'crm.lead.edit' THEN '编辑商机'
  WHEN 'crm.lead.delete' THEN '删除商机'
  WHEN 'crm.lead.import' THEN '导入商机'
  WHEN 'crm.lead.export' THEN '导出商机'
  WHEN 'crm.lead_followup.view' THEN '查看商机跟进'
  WHEN 'crm.lead_followup.create' THEN '新增商机跟进'
  WHEN 'crm.organization.nurture.manage' THEN '管理客户经营计划'
  WHEN 'crm.dashboard.self.view' THEN '查看个人数据看板'
  WHEN 'crm.dashboard.management.view' THEN '查看管理数据看板'
  ELSE `name`
END
WHERE `key` IN (
  'crm.lead.view', 'crm.lead.create', 'crm.lead.edit', 'crm.lead.delete',
  'crm.lead.import', 'crm.lead.export', 'crm.lead_followup.view', 'crm.lead_followup.create',
  'crm.organization.nurture.manage', 'crm.dashboard.self.view', 'crm.dashboard.management.view'
);

UPDATE `roles`
SET `description` = CASE `key`
  WHEN 'SALES' THEN '创建并维护联系人、营销线索、商机和跟进记录'
  WHEN 'VIEWER' THEN '只读查看联系人、营销线索、商机和跟进记录'
  ELSE `description`
END
WHERE `key` IN ('SALES', 'VIEWER');

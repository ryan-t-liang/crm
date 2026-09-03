-- Kivisense CRM 2.0 core domain. Legacy Sowind tables are intentionally untouched.

CREATE TABLE `contacts` (
    `id` VARCHAR(32) NOT NULL,
    `contact_name` VARCHAR(160) NOT NULL,
    `company_short_name` VARCHAR(120) NULL,
    `company_name` VARCHAR(240) NULL,
    `department` VARCHAR(160) NULL,
    `title` VARCHAR(160) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(64) NULL,
    `wechat` VARCHAR(191) NULL,
    `linkedin` VARCHAR(500) NULL,
    `website` VARCHAR(500) NULL,
    `industry` VARCHAR(160) NULL,
    `source` VARCHAR(160) NULL,
    `country` VARCHAR(120) NULL,
    `city` VARCHAR(120) NULL,
    `region` VARCHAR(120) NULL,
    `stage` ENUM('INITIAL', 'ONE_TO_ONE', 'SOLUTION', 'CONVENTION') NOT NULL DEFAULT 'INITIAL',
    `owner_user_id` VARCHAR(32) NULL,
    `next_followup_at` DATETIME(3) NULL,
    `initial_context` TEXT NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by_user_id` VARCHAR(32) NOT NULL,

    INDEX `contacts_stage_updated_at_idx`(`stage`, `updated_at`),
    INDEX `contacts_owner_user_id_updated_at_idx`(`owner_user_id`, `updated_at`),
    INDEX `contacts_next_followup_at_idx`(`next_followup_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `contact_followups` (
    `id` VARCHAR(32) NOT NULL,
    `contact_id` VARCHAR(32) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `owner_user_id` VARCHAR(32) NOT NULL,
    `type` ENUM('GENERAL', 'MEETING', 'CALL', 'EMAIL', 'WECHAT', 'OTHER') NOT NULL DEFAULT 'GENERAL',
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by_user_id` VARCHAR(32) NOT NULL,

    INDEX `contact_followups_contact_id_occurred_at_idx`(`contact_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crm_leads` (
    `id` VARCHAR(32) NOT NULL,
    `contact_id` VARCHAR(32) NOT NULL,
    `requirement_summary` VARCHAR(200) NOT NULL,
    `requirement_detail` TEXT NULL,
    `latest_progress` TEXT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `estimated_quote` DECIMAL(18, 2) NULL,
    `currency` CHAR(3) NULL,
    `project_domain` VARCHAR(160) NULL,
    `project_type` VARCHAR(160) NULL,
    `technology_type` VARCHAR(160) NULL,
    `product_type` VARCHAR(160) NULL,
    `product_name` VARCHAR(240) NULL,
    `resource_requirement` TEXT NULL,
    `solution` TEXT NULL,
    `remark` TEXT NULL,
    `status` ENUM('NEW', 'QUALIFIED', 'SOLUTION', 'QUOTATION', 'WON', 'LOST') NOT NULL DEFAULT 'NEW',
    `sales_owner_user_id` VARCHAR(32) NULL,
    `followup_owner_user_id` VARCHAR(32) NULL,
    `next_followup_at` DATETIME(3) NULL,
    `last_followup_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by_user_id` VARCHAR(32) NOT NULL,

    INDEX `crm_leads_contact_id_updated_at_idx`(`contact_id`, `updated_at`),
    INDEX `crm_leads_status_updated_at_idx`(`status`, `updated_at`),
    INDEX `crm_leads_priority_updated_at_idx`(`priority`, `updated_at`),
    INDEX `crm_leads_sales_owner_user_id_updated_at_idx`(`sales_owner_user_id`, `updated_at`),
    INDEX `crm_leads_followup_owner_user_id_updated_at_idx`(`followup_owner_user_id`, `updated_at`),
    INDEX `crm_leads_next_followup_at_idx`(`next_followup_at`),
    INDEX `crm_leads_last_followup_at_idx`(`last_followup_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_followups` (
    `id` VARCHAR(32) NOT NULL,
    `lead_id` VARCHAR(32) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `owner_user_id` VARCHAR(32) NOT NULL,
    `type` ENUM('GENERAL', 'MEETING', 'CALL', 'EMAIL', 'WECHAT', 'OTHER') NOT NULL DEFAULT 'GENERAL',
    `content` TEXT NOT NULL,
    `important` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by_user_id` VARCHAR(32) NOT NULL,

    INDEX `lead_followups_lead_id_occurred_at_idx`(`lead_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `contacts`
    ADD CONSTRAINT `contacts_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `contacts_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `contact_followups`
    ADD CONSTRAINT `contact_followups_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `contact_followups_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `contact_followups_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `crm_leads`
    ADD CONSTRAINT `crm_leads_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `crm_leads_sales_owner_user_id_fkey` FOREIGN KEY (`sales_owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `crm_leads_followup_owner_user_id_fkey` FOREIGN KEY (`followup_owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `crm_leads_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `lead_followups`
    ADD CONSTRAINT `lead_followups_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `lead_followups_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `lead_followups_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

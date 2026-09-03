-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(32) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(32) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `module` VARCHAR(64) NOT NULL,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permissions_key_key`(`key`),
    INDEX `permissions_module_idx`(`module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` VARCHAR(32) NOT NULL,
    `permission_id` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `login_account` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `must_change_password` BOOLEAN NOT NULL DEFAULT true,
    `password_changed_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `failed_login_count` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `role_id` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_login_account_key`(`login_account`),
    INDEX `users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` VARCHAR(32) NOT NULL,
    `user_id` VARCHAR(32) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(500) NULL,

    UNIQUE INDEX `auth_sessions_token_hash_key`(`token_hash`),
    INDEX `auth_sessions_user_id_expires_at_idx`(`user_id`, `expires_at`),
    INDEX `auth_sessions_revoked_at_idx`(`revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(32) NOT NULL,
    `actor_user_id` VARCHAR(32) NULL,
    `actor_name` VARCHAR(120) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `module` VARCHAR(64) NOT NULL,
    `target_type` VARCHAR(64) NOT NULL,
    `target_id` VARCHAR(64) NULL,
    `details` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `request_id` VARCHAR(64) NULL,
    `user_agent` VARCHAR(500) NULL,
    `trace_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    INDEX `audit_logs_module_created_at_idx`(`module`, `created_at`),
    INDEX `audit_logs_trace_id_idx`(`trace_id`),
    INDEX `audit_logs_target_type_target_id_idx`(`target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE `import_jobs` (
    `id` VARCHAR(32) NOT NULL,
    `job_no` VARCHAR(80) NOT NULL,
    `object_type` VARCHAR(40) NOT NULL,
    `subtype` VARCHAR(80) NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `storage_path` VARCHAR(500) NULL,
    `file_hash` CHAR(64) NULL,
    `mapping_json` JSON NULL,
    `result_json` JSON NULL,
    `conflict_strategy` VARCHAR(40) NULL,
    `unmatched_strategy` VARCHAR(40) NULL,
    `status` ENUM('PENDING', 'UPLOADED', 'PREFLIGHT_READY', 'READY_TO_EXECUTE', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `total_count` INTEGER NOT NULL DEFAULT 0,
    `importable_count` INTEGER NOT NULL DEFAULT 0,
    `success_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `skipped_count` INTEGER NOT NULL DEFAULT 0,
    `created_count` INTEGER NOT NULL DEFAULT 0,
    `updated_count` INTEGER NOT NULL DEFAULT 0,
    `failure_file_path` VARCHAR(500) NULL,
    `created_by` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `preflighted_at` DATETIME(3) NULL,
    `processing_started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,

    UNIQUE INDEX `import_jobs_job_no_key`(`job_no`),
    INDEX `import_jobs_object_type_created_at_idx`(`object_type`, `created_at`),
    INDEX `import_jobs_created_by_created_at_idx`(`created_by`, `created_at`),
    INDEX `import_jobs_object_type_file_hash_idx`(`object_type`, `file_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_job_rows` (
    `id` VARCHAR(32) NOT NULL,
    `import_job_id` VARCHAR(32) NOT NULL,
    `row_number` INTEGER NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `conflict_type` VARCHAR(64) NULL,
    `identity` VARCHAR(191) NULL,
    `raw_data` JSON NOT NULL,
    `normalized_data` JSON NULL,
    `errors` JSON NULL,
    `warnings` JSON NULL,
    `created_id` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `import_job_rows_status_idx`(`status`),
    UNIQUE INDEX `import_job_rows_import_job_id_row_number_key`(`import_job_id`, `row_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `export_jobs` (
    `id` VARCHAR(32) NOT NULL,
    `job_no` VARCHAR(80) NOT NULL,
    `object_type` VARCHAR(40) NOT NULL,
    `status` ENUM('PENDING', 'UPLOADED', 'PREFLIGHT_READY', 'READY_TO_EXECUTE', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `request_json` JSON NOT NULL,
    `scope` VARCHAR(32) NOT NULL DEFAULT 'ALL',
    `filter_json` JSON NULL,
    `selected_count` INTEGER NOT NULL DEFAULT 0,
    `requested_fields` JSON NULL,
    `effective_fields` JSON NULL,
    `file_name` VARCHAR(255) NULL,
    `storage_path` VARCHAR(500) NULL,
    `row_count` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(1000) NULL,
    `created_by` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,

    UNIQUE INDEX `export_jobs_job_no_key`(`job_no`),
    INDEX `export_jobs_created_by_created_at_idx`(`created_by`, `created_at`),
    INDEX `export_jobs_object_type_created_at_idx`(`object_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_followups` ADD CONSTRAINT `contact_followups_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_followups` ADD CONSTRAINT `contact_followups_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_followups` ADD CONSTRAINT `contact_followups_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_leads` ADD CONSTRAINT `crm_leads_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_leads` ADD CONSTRAINT `crm_leads_sales_owner_user_id_fkey` FOREIGN KEY (`sales_owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_leads` ADD CONSTRAINT `crm_leads_followup_owner_user_id_fkey` FOREIGN KEY (`followup_owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_leads` ADD CONSTRAINT `crm_leads_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_followups` ADD CONSTRAINT `lead_followups_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_followups` ADD CONSTRAINT `lead_followups_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_followups` ADD CONSTRAINT `lead_followups_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_job_rows` ADD CONSTRAINT `import_job_rows_import_job_id_fkey` FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

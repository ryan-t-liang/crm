-- CreateTable
CREATE TABLE `brands` (
    `id` VARCHAR(32) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `short_name` VARCHAR(64) NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `theme_config` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `brands_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
CREATE TABLE `user_brand_access` (
    `user_id` VARCHAR(32) NOT NULL,
    `brand_id` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_brand_access_brand_id_idx`(`brand_id`),
    PRIMARY KEY (`user_id`, `brand_id`)
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
CREATE TABLE `customers` (
    `id` VARCHAR(32) NOT NULL,
    `customer_no` VARCHAR(64) NOT NULL,
    `display_name` VARCHAR(160) NOT NULL,
    `mobile` VARCHAR(40) NOT NULL,
    `mobile_normalized` VARCHAR(20) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_customer_no_key`(`customer_no`),
    UNIQUE INDEX `customers_mobile_normalized_key`(`mobile_normalized`),
    INDEX `customers_display_name_idx`(`display_name`),
    INDEX `customers_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_brand_profiles` (
    `id` VARCHAR(32) NOT NULL,
    `customer_id` VARCHAR(32) NOT NULL,
    `brand_id` VARCHAR(32) NOT NULL,
    `brand_member_no` VARCHAR(64) NULL,
    `display_name` VARCHAR(160) NULL,
    `salutation` VARCHAR(40) NULL,
    `last_name` VARCHAR(100) NULL,
    `first_name` VARCHAR(100) NULL,
    `birthday` DATE NULL,
    `email` VARCHAR(191) NULL,
    `mobile` VARCHAR(40) NULL,
    `country` VARCHAR(100) NULL,
    `region` VARCHAR(100) NULL,
    `city` VARCHAR(100) NULL,
    `postal_code` VARCHAR(32) NULL,
    `address_line` VARCHAR(500) NULL,
    `language` VARCHAR(64) NULL,
    `preferred_contact` VARCHAR(64) NULL,
    `owns_brand_watch` BOOLEAN NULL,
    `purchase_channel` VARCHAR(120) NULL,
    `interest_center` VARCHAR(160) NULL,
    `favorite_collection` VARCHAR(160) NULL,
    `membership_status` VARCHAR(40) NULL DEFAULT 'REGISTERED',
    `registration_source` VARCHAR(120) NULL,
    `registered_at` DATETIME(3) NULL,
    `registration_data` JSON NULL,
    `open_id` VARCHAR(191) NULL,
    `union_id` VARCHAR(191) NULL,
    `extra_attributes` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_brand_profiles_brand_id_registered_at_idx`(`brand_id`, `registered_at`),
    INDEX `customer_brand_profiles_email_idx`(`email`),
    UNIQUE INDEX `customer_brand_profiles_customer_id_brand_id_key`(`customer_id`, `brand_id`),
    UNIQUE INDEX `customer_brand_profiles_brand_id_brand_member_no_key`(`brand_id`, `brand_member_no`),
    UNIQUE INDEX `customer_brand_profiles_brand_id_open_id_key`(`brand_id`, `open_id`),
    UNIQUE INDEX `customer_brand_profiles_brand_id_union_id_key`(`brand_id`, `union_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_identities` (
    `id` VARCHAR(32) NOT NULL,
    `customer_id` VARCHAR(32) NOT NULL,
    `brand_id` VARCHAR(32) NOT NULL,
    `identity_type` VARCHAR(40) NOT NULL,
    `scope` VARCHAR(120) NOT NULL,
    `app_id` VARCHAR(120) NULL,
    `value` VARCHAR(512) NOT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_identities_customer_id_brand_id_idx`(`customer_id`, `brand_id`),
    UNIQUE INDEX `customer_identities_brand_id_identity_type_scope_value_key`(`brand_id`, `identity_type`, `scope`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consent_records` (
    `id` VARCHAR(32) NOT NULL,
    `customer_id` VARCHAR(32) NULL,
    `lead_id` VARCHAR(32) NULL,
    `customer_brand_profile_id` VARCHAR(32) NULL,
    `brand_id` VARCHAR(32) NOT NULL,
    `purpose` VARCHAR(100) NOT NULL,
    `channel` VARCHAR(64) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `policy_version` VARCHAR(120) NOT NULL,
    `terms_version` VARCHAR(120) NULL,
    `consent_text` TEXT NULL,
    `source` VARCHAR(80) NOT NULL,
    `captured_at` DATETIME(3) NOT NULL,
    `captured_by` VARCHAR(32) NULL,
    `evidence` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `consent_records_customer_id_brand_id_purpose_channel_capture_idx`(`customer_id`, `brand_id`, `purpose`, `channel`, `captured_at`),
    INDEX `consent_records_lead_id_idx`(`lead_id`),
    INDEX `consent_records_customer_brand_profile_id_purpose_channel_ca_idx`(`customer_brand_profile_id`, `purpose`, `channel`, `captured_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_definitions` (
    `id` VARCHAR(32) NOT NULL,
    `brand_id` VARCHAR(32) NOT NULL,
    `object_type` VARCHAR(40) NOT NULL,
    `form_key` VARCHAR(80) NOT NULL,
    `version` VARCHAR(80) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `schema_json` JSON NOT NULL,
    `policy_version` VARCHAR(120) NULL,
    `terms_version` VARCHAR(120) NULL,
    `effective_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `form_definitions_brand_id_object_type_active_idx`(`brand_id`, `object_type`, `active`),
    UNIQUE INDEX `form_definitions_brand_id_object_type_form_key_version_key`(`brand_id`, `object_type`, `form_key`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` VARCHAR(32) NOT NULL,
    `lead_no` VARCHAR(80) NOT NULL,
    `brand_id` VARCHAR(32) NOT NULL,
    `customer_id` VARCHAR(32) NULL,
    `form_definition_id` VARCHAR(32) NULL,
    `lead_type` VARCHAR(80) NOT NULL DEFAULT 'PURCHASE_INTENT',
    `status` VARCHAR(40) NOT NULL DEFAULT 'NEW',
    `owner_user_id` VARCHAR(32) NULL,
    `source` VARCHAR(80) NOT NULL,
    `submission_mode` VARCHAR(40) NOT NULL,
    `form_version` VARCHAR(80) NOT NULL,
    `sku` VARCHAR(160) NULL,
    `email` VARCHAR(191) NOT NULL,
    `salutation` VARCHAR(40) NOT NULL,
    `firstname` VARCHAR(100) NOT NULL,
    `lastname` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(40) NOT NULL,
    `language` VARCHAR(32) NOT NULL DEFAULT 'zh',
    `preferred_contact` VARCHAR(64) NOT NULL,
    `country` VARCHAR(100) NOT NULL,
    `city` VARCHAR(100) NULL,
    `ownership` VARCHAR(8) NULL,
    `birthday` DATE NULL,
    `purchase_method` VARCHAR(120) NULL,
    `retailer` VARCHAR(191) NULL,
    `processing_consent` BOOLEAN NOT NULL,
    `marketing_opt_in` BOOLEAN NOT NULL DEFAULT false,
    `attributes` JSON NOT NULL,
    `original_snapshot` JSON NULL,
    `sync_status` ENUM('NOT_SYNCED', 'PENDING', 'GATEWAY_QUEUED', 'FAILED_VALIDATION', 'FAILED_AUTH', 'SUCCEEDED', 'FAILED', 'FAILED_PERMANENT') NOT NULL DEFAULT 'PENDING',
    `gateway_http_status` INTEGER NULL,
    `gateway_ref` VARCHAR(191) NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `last_error` VARCHAR(1000) NULL,
    `last_sync_at` DATETIME(3) NULL,
    `idempotency_key` VARCHAR(191) NULL,
    `created_by_user_id` VARCHAR(32) NULL,
    `created_by_service` VARCHAR(120) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `leads_lead_no_key`(`lead_no`),
    UNIQUE INDEX `leads_idempotency_key_key`(`idempotency_key`),
    INDEX `leads_brand_id_created_at_idx`(`brand_id`, `created_at`),
    INDEX `leads_customer_id_idx`(`customer_id`),
    INDEX `leads_status_idx`(`status`),
    INDEX `leads_sync_status_idx`(`sync_status`),
    INDEX `leads_gateway_ref_idx`(`gateway_ref`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_notes` (
    `id` VARCHAR(32) NOT NULL,
    `customer_id` VARCHAR(32) NOT NULL,
    `body` TEXT NOT NULL,
    `created_by` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_notes_customer_id_created_at_idx`(`customer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_journey_events` (
    `id` VARCHAR(32) NOT NULL,
    `customer_id` VARCHAR(32) NOT NULL,
    `brand_id` VARCHAR(32) NULL,
    `event_type` VARCHAR(80) NOT NULL,
    `title` VARCHAR(240) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `event_at` DATETIME(3) NOT NULL,
    `source` VARCHAR(80) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `customer_journey_events_customer_id_event_at_idx`(`customer_id`, `event_at`),
    INDEX `customer_journey_events_brand_id_event_at_idx`(`brand_id`, `event_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_hq_links` (
    `id` VARCHAR(32) NOT NULL,
    `customer_id` VARCHAR(32) NOT NULL,
    `brand_id` VARCHAR(32) NOT NULL,
    `external_system` VARCHAR(80) NOT NULL,
    `external_contact_id` VARCHAR(191) NOT NULL,
    `sync_status` VARCHAR(32) NOT NULL DEFAULT 'NOT_SYNCED',
    `sync_method` VARCHAR(80) NULL,
    `last_synced_at` DATETIME(3) NULL,
    `last_error` VARCHAR(1000) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_hq_links_external_system_external_contact_id_idx`(`external_system`, `external_contact_id`),
    UNIQUE INDEX `customer_hq_links_customer_id_brand_id_external_system_exter_key`(`customer_id`, `brand_id`, `external_system`, `external_contact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integration_outbox` (
    `id` VARCHAR(32) NOT NULL,
    `entity_type` VARCHAR(64) NOT NULL,
    `entity_id` VARCHAR(32) NOT NULL,
    `brand_id` VARCHAR(32) NOT NULL,
    `integration` VARCHAR(80) NOT NULL DEFAULT 'SOWIND_GATEWAY',
    `event_type` VARCHAR(100) NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `payload_snapshot_json` JSON NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'RETRY_WAITING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_retry_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `locked_at` DATETIME(3) NULL,
    `last_http_status` INTEGER NULL,
    `last_response_json` JSON NULL,
    `last_error` VARCHAR(1000) NULL,
    `processed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `integration_outbox_idempotency_key_key`(`idempotency_key`),
    INDEX `integration_outbox_status_next_retry_at_idx`(`status`, `next_retry_at`),
    INDEX `integration_outbox_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integration_attempts` (
    `id` VARCHAR(32) NOT NULL,
    `outbox_id` VARCHAR(32) NOT NULL,
    `lead_id` VARCHAR(32) NOT NULL,
    `attempt_number` INTEGER NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `brand` VARCHAR(32) NOT NULL,
    `http_status` INTEGER NULL,
    `response_json` JSON NULL,
    `error_code` VARCHAR(120) NULL,
    `error_message` VARCHAR(1000) NULL,
    `started_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NOT NULL,
    `duration_ms` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `integration_attempts_outbox_id_idx`(`outbox_id`),
    INDEX `integration_attempts_lead_id_idx`(`lead_id`),
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
    `brand_id` VARCHAR(32) NULL,
    `details` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `request_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    INDEX `audit_logs_module_created_at_idx`(`module`, `created_at`),
    INDEX `audit_logs_target_type_target_id_idx`(`target_type`, `target_id`),
    INDEX `audit_logs_brand_id_created_at_idx`(`brand_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_jobs` (
    `id` VARCHAR(32) NOT NULL,
    `job_no` VARCHAR(80) NOT NULL,
    `object_type` VARCHAR(40) NOT NULL,
    `brand_id` VARCHAR(32) NOT NULL,
    `subtype` VARCHAR(80) NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `storage_path` VARCHAR(500) NULL,
    `conflict_strategy` VARCHAR(40) NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `total_count` INTEGER NOT NULL DEFAULT 0,
    `success_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `skipped_count` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    UNIQUE INDEX `import_jobs_job_no_key`(`job_no`),
    INDEX `import_jobs_brand_id_object_type_created_at_idx`(`brand_id`, `object_type`, `created_at`),
    INDEX `import_jobs_created_by_created_at_idx`(`created_by`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_job_rows` (
    `id` VARCHAR(32) NOT NULL,
    `import_job_id` VARCHAR(32) NOT NULL,
    `row_number` INTEGER NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `identity` VARCHAR(191) NULL,
    `raw_data` JSON NOT NULL,
    `errors` JSON NULL,
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
    `brand_id` VARCHAR(32) NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `request_json` JSON NOT NULL,
    `file_name` VARCHAR(255) NULL,
    `storage_path` VARCHAR(500) NULL,
    `row_count` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(1000) NULL,
    `created_by` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    UNIQUE INDEX `export_jobs_job_no_key`(`job_no`),
    INDEX `export_jobs_created_by_created_at_idx`(`created_by`, `created_at`),
    INDEX `export_jobs_brand_id_object_type_created_at_idx`(`brand_id`, `object_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integration_nonces` (
    `id` VARCHAR(32) NOT NULL,
    `client_id` VARCHAR(120) NOT NULL,
    `nonce` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `integration_nonces_expires_at_idx`(`expires_at`),
    UNIQUE INDEX `integration_nonces_client_id_nonce_key`(`client_id`, `nonce`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_brand_access` ADD CONSTRAINT `user_brand_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_brand_access` ADD CONSTRAINT `user_brand_access_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_brand_profiles` ADD CONSTRAINT `customer_brand_profiles_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_brand_profiles` ADD CONSTRAINT `customer_brand_profiles_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_identities` ADD CONSTRAINT `customer_identities_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_identities` ADD CONSTRAINT `customer_identities_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_records` ADD CONSTRAINT `consent_records_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_records` ADD CONSTRAINT `consent_records_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_records` ADD CONSTRAINT `consent_records_customer_brand_profile_id_fkey` FOREIGN KEY (`customer_brand_profile_id`) REFERENCES `customer_brand_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_records` ADD CONSTRAINT `consent_records_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_definitions` ADD CONSTRAINT `form_definitions_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_form_definition_id_fkey` FOREIGN KEY (`form_definition_id`) REFERENCES `form_definitions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_notes` ADD CONSTRAINT `customer_notes_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_journey_events` ADD CONSTRAINT `customer_journey_events_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_journey_events` ADD CONSTRAINT `customer_journey_events_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_hq_links` ADD CONSTRAINT `customer_hq_links_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_hq_links` ADD CONSTRAINT `customer_hq_links_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `integration_outbox` ADD CONSTRAINT `integration_outbox_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_jobs` ADD CONSTRAINT `import_jobs_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_job_rows` ADD CONSTRAINT `import_job_rows_import_job_id_fkey` FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

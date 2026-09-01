-- Remediation Round 2: activate scoped CustomerIdentity and add an isolated
-- short-lived WeChat identity context. Existing Member, Profile and Lead rows
-- are preserved; legacy Profile identity columns remain for compatibility.

ALTER TABLE `customer_identities`
  ADD COLUMN `source` VARCHAR(80) NOT NULL DEFAULT 'LEGACY_IDENTITY_MIGRATION' AFTER `verified_at`;

CREATE TABLE `wechat_identity_contexts` (
  `id` VARCHAR(32) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `brand_id` VARCHAR(32) NOT NULL,
  `customer_id` VARCHAR(32) NULL,
  `app_id` VARCHAR(120) NOT NULL,
  `app_scope` VARCHAR(160) NOT NULL,
  `mobile_normalized` VARCHAR(20) NOT NULL,
  `open_id` VARCHAR(191) NULL,
  `union_id` VARCHAR(191) NULL,
  `union_id_scope` VARCHAR(160) NULL,
  `verified_at` DATETIME(3) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `wechat_identity_contexts_token_hash_key`(`token_hash`),
  INDEX `wechat_identity_contexts_brand_id_mobile_normalized_idx`(`brand_id`, `mobile_normalized`),
  INDEX `wechat_identity_contexts_customer_id_brand_id_idx`(`customer_id`, `brand_id`),
  INDEX `wechat_identity_contexts_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `wechat_identity_contexts_brand_id_fkey`
    FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `wechat_identity_contexts_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Legacy profile identities did not include App/Open Platform scope. Backfill
-- them as unverified legacy rows, so new authentication never trusts them until
-- a verified WeChat context establishes an explicitly scoped binding.
INSERT IGNORE INTO `customer_identities` (
  `id`, `customer_id`, `brand_id`, `identity_type`, `scope`, `app_id`, `value`, `verified_at`, `source`, `created_at`, `updated_at`
)
SELECT
  MD5(CONCAT('R2:OPENID:', `profile`.`id`)),
  `profile`.`customer_id`,
  `profile`.`brand_id`,
  'OPENID',
  CONCAT('LEGACY_APP:', `brand`.`code`),
  NULL,
  `profile`.`open_id`,
  NULL,
  'LEGACY_PROFILE_BACKFILL',
  COALESCE(`profile`.`created_at`, CURRENT_TIMESTAMP(3)),
  COALESCE(`profile`.`updated_at`, CURRENT_TIMESTAMP(3))
FROM `customer_brand_profiles` AS `profile`
INNER JOIN `brands` AS `brand` ON `brand`.`id` = `profile`.`brand_id`
WHERE `profile`.`open_id` IS NOT NULL AND `profile`.`open_id` <> '';

INSERT IGNORE INTO `customer_identities` (
  `id`, `customer_id`, `brand_id`, `identity_type`, `scope`, `app_id`, `value`, `verified_at`, `source`, `created_at`, `updated_at`
)
SELECT
  MD5(CONCAT('R2:UNIONID:', `profile`.`id`)),
  `profile`.`customer_id`,
  `profile`.`brand_id`,
  'UNIONID',
  CONCAT('LEGACY_OPEN_PLATFORM:', `brand`.`code`),
  NULL,
  `profile`.`union_id`,
  NULL,
  'LEGACY_PROFILE_BACKFILL',
  COALESCE(`profile`.`created_at`, CURRENT_TIMESTAMP(3)),
  COALESCE(`profile`.`updated_at`, CURRENT_TIMESTAMP(3))
FROM `customer_brand_profiles` AS `profile`
INNER JOIN `brands` AS `brand` ON `brand`.`id` = `profile`.`brand_id`
WHERE `profile`.`union_id` IS NOT NULL AND `profile`.`union_id` <> '';

-- Preserve the existing journey rows while aligning the V2.0 event dictionary.
UPDATE `customer_journey_events`
SET `event_type` = 'REGISTER'
WHERE `event_type` = 'MEMBER_REGISTERED';

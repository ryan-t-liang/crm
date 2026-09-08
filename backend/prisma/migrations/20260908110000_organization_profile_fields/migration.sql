-- Organization profile extension for unified customer, partner and supplier records.
-- Additive only: existing records default to ENTERPRISE and no data is removed.

ALTER TABLE `organizations`
  ADD COLUMN `organization_type` ENUM('ENTERPRISE', 'SCHOOL', 'GOVERNMENT', 'ASSOCIATION', 'NONPROFIT', 'FOUNDATION', 'OTHER') NOT NULL DEFAULT 'ENTERPRISE',
  ADD COLUMN `district` VARCHAR(120) NULL,
  ADD COLUMN `street` VARCHAR(300) NULL,
  ADD INDEX `organizations_organization_type_updated_at_idx` (`organization_type`, `updated_at`);

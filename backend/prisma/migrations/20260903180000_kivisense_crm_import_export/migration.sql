-- Kivisense CRM 2.0 import/export jobs are organization-scoped, not GP/UN brand-scoped.
-- Legacy CUSTOMER/LEAD versus CRM CONTACT/CRM_LEAD invariants are enforced by services.
ALTER TABLE `import_jobs`
  DROP FOREIGN KEY `import_jobs_brand_id_fkey`;

ALTER TABLE `import_jobs`
  MODIFY `brand_id` VARCHAR(32) NULL;

ALTER TABLE `import_jobs`
  ADD CONSTRAINT `import_jobs_brand_id_fkey`
  FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

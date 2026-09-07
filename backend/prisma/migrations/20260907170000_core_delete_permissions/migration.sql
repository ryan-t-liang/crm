-- Backfill delete permissions that older UAT installations did not receive from
-- seed data. This is additive and preserves all existing role assignments.

INSERT INTO `permissions` (`id`, `key`, `name`, `module`)
VALUES
  (REPLACE(UUID(), '-', ''), 'crm.contact.delete', '删除联系人', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.lead.delete', '删除商机', 'crm')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `module` = VALUES(`module`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
CROSS JOIN `permissions` p
WHERE
  (r.`key` = 'SUPER_ADMIN' AND p.`key` IN (
    'crm.contact.delete',
    'crm.lead.delete'
  ))
  OR
  (r.`key` = 'SALES' AND p.`key` IN (
    'crm.contact.delete',
    'crm.lead.delete'
  ));

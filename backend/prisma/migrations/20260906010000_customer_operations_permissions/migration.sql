-- Add Customer Operations permissions to existing installations without reseeding users or roles.

INSERT INTO `permissions` (`id`, `key`, `name`, `module`)
VALUES
  (REPLACE(UUID(), '-', ''), 'crm.organization.view', '查看公司', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.organization.create', '创建公司', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.organization.edit', '编辑公司', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.organization.delete', '删除公司', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.organization.import', '导入公司', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.organization.export', '导出公司', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.organization.score.edit', '编辑公司适配评分', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.organization.nurture.manage', '管理客户孵化', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.task.view', '查看任务', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.task.create', '创建任务', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.task.edit', '编辑任务', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.task.complete', '完成任务', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.task.cancel', '取消任务', 'crm'),
  (REPLACE(UUID(), '-', ''), 'crm.dashboard.self.view', '查看个人 Dashboard', 'crm_dashboard'),
  (REPLACE(UUID(), '-', ''), 'crm.dashboard.management.view', '查看管理 Dashboard', 'crm_dashboard')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `module` = VALUES(`module`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
CROSS JOIN `permissions` p
WHERE
  (r.`key` = 'SUPER_ADMIN' AND p.`key` IN (
    'crm.organization.view', 'crm.organization.create', 'crm.organization.edit', 'crm.organization.delete',
    'crm.organization.import', 'crm.organization.export', 'crm.organization.score.edit', 'crm.organization.nurture.manage',
    'crm.task.view', 'crm.task.create', 'crm.task.edit', 'crm.task.complete', 'crm.task.cancel',
    'crm.dashboard.self.view', 'crm.dashboard.management.view'
  ))
  OR
  (r.`key` = 'SALES' AND p.`key` IN (
    'crm.organization.view', 'crm.organization.create', 'crm.organization.edit', 'crm.organization.delete',
    'crm.organization.score.edit', 'crm.organization.nurture.manage',
    'crm.task.view', 'crm.task.create', 'crm.task.edit', 'crm.task.complete', 'crm.task.cancel',
    'crm.dashboard.self.view'
  ))
  OR
  (r.`key` = 'VIEWER' AND p.`key` IN (
    'crm.organization.view', 'crm.task.view', 'crm.dashboard.self.view'
  ));

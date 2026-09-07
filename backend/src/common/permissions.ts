export const permissionDependencies: Readonly<Record<string, readonly string[]>> = {
  "account.view": ["account.create", "account.edit", "account.disable", "account.reset"],
  "roles.view": ["roles.configure"],
  "crm.contact.view": ["crm.contact.create", "crm.contact.edit", "crm.contact.delete", "crm.contact.import", "crm.contact.export", "crm.contact_followup.view", "crm.contact_followup.create", "crm.lead.create"],
  "crm.contact_followup.view": ["crm.contact_followup.create"],
  "crm.lead.view": ["crm.lead.create", "crm.lead.edit", "crm.lead.delete", "crm.lead.import", "crm.lead.export", "crm.lead_followup.view", "crm.lead_followup.create"],
  "crm.lead_followup.view": ["crm.lead_followup.create"],
  "crm.marketing_lead.view": ["crm.marketing_lead.create", "crm.marketing_lead.edit", "crm.marketing_lead.assign", "crm.marketing_lead.qualify", "crm.marketing_lead.convert", "crm.marketing_lead.delete", "crm.marketing_lead.import", "crm.marketing_lead.export", "crm.marketing.activity.create"],
  "crm.marketing.score_rule.view": ["crm.marketing.score_rule.manage"],
  "crm.marketing.analytics.view": [],
  "crm.organization.view": ["crm.organization.create", "crm.organization.edit", "crm.organization.delete", "crm.organization.import", "crm.organization.export", "crm.organization.score.edit", "crm.organization.nurture.manage"],
  "crm.task.view": ["crm.task.create", "crm.task.edit", "crm.task.complete", "crm.task.cancel"],
  "crm.dashboard.self.view": [],
  "crm.dashboard.management.view": [],
};

export function normalizePermissionDependencies(keys: Iterable<string>): string[] {
  const normalized = new Set(keys);
  for (const [parent, children] of Object.entries(permissionDependencies)) {
    if (!normalized.has(parent)) children.forEach((child) => normalized.delete(child));
  }
  return [...normalized].sort();
}

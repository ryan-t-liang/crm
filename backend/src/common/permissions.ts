export const permissionDependencies: Readonly<Record<string, readonly string[]>> = {
  "account.view": ["account.create", "account.edit", "account.disable", "account.reset"],
  "roles.view": ["roles.configure"],
  "crm.contact.view": ["crm.contact.create", "crm.contact.edit", "crm.contact.import", "crm.contact.export", "crm.contact_followup.view", "crm.contact_followup.create", "crm.lead.create"],
  "crm.contact_followup.view": ["crm.contact_followup.create"],
  "crm.lead.view": ["crm.lead.create", "crm.lead.edit", "crm.lead.import", "crm.lead.export", "crm.lead_followup.view", "crm.lead_followup.create"],
  "crm.lead_followup.view": ["crm.lead_followup.create"],
};

export function normalizePermissionDependencies(keys: Iterable<string>): string[] {
  const normalized = new Set(keys);
  for (const [parent, children] of Object.entries(permissionDependencies)) {
    if (!normalized.has(parent)) children.forEach((child) => normalized.delete(child));
  }
  return [...normalized].sort();
}

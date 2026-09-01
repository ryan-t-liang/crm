export const permissionDependencies: Readonly<Record<string, readonly string[]>> = {
  "customer.view": ["customer.edit", "customer.import", "customer.export"],
  "lead.view": ["lead.edit", "lead.import", "lead.export"],
  "account.view": ["account.create", "account.edit", "account.disable", "account.reset"],
  "roles.view": ["roles.configure"],
};

export function normalizePermissionDependencies(keys: Iterable<string>): string[] {
  const normalized = new Set(keys);
  for (const [parent, children] of Object.entries(permissionDependencies)) {
    if (!normalized.has(parent)) children.forEach((child) => normalized.delete(child));
  }
  return [...normalized].sort();
}

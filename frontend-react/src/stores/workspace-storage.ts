export interface WorkspaceConfig<T> {
  version: number;
  label: string;
  initial: () => T;
  empty: () => T;
  valid: (value: unknown) => value is T;
}
export type WorkspaceResult = { ok: true } | { ok: false; error: string };
export interface WorkspaceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function readWorkspace<T>(storage: WorkspaceStorage, key: string, config: WorkspaceConfig<T>) {
  let raw: string | null = null;
  try { raw = storage.getItem(key); }
  catch { return { state: config.empty(), raw, issue: `${config.label} 本地存储无法访问，未写入或删除数据。` }; }
  if (raw === null) return { state: config.initial(), raw, issue: "" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== config.version)
      return { state: config.empty(), raw, issue: `${config.label} 数据版本不兼容，原始数据已保留。` };
    if (!config.valid(parsed)) return { state: config.empty(), raw, issue: `${config.label} 数据结构无法读取，原始数据已保留。` };
    return { state: parsed, raw, issue: "" };
  } catch { return { state: config.empty(), raw, issue: `${config.label} 数据无法读取，原始数据已保留。` }; }
}
export function saveWorkspace<T>(storage: WorkspaceStorage, key: string, next: T, expectedRaw: string | null, reset = false): WorkspaceResult & { raw?: string } {
  try {
    if (!reset && storage.getItem(key) !== expectedRaw) return { ok: false, error: "本地数据已被另一个页面修改；未覆盖，请刷新后重试。" };
    const raw = JSON.stringify(next);
    storage.setItem(key, raw);
    return { ok: true, raw };
  } catch { return { ok: false, error: "本地保存失败，原有数据未被删除；请检查浏览器存储权限和容量。" }; }
}

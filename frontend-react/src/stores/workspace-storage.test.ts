import { describe, expect, it } from "vitest";
import { readWorkspace, saveWorkspace, type WorkspaceConfig } from "./workspace-storage";
type Data = { version: number; records: Array<{ id: string; createdAt?: string }> };
const keys = ["kivisense-crm-prototype-v1", "kivisense-member-operations-v1"];
const memory = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
for (const [index, key] of keys.entries()) describe(index ? "Member safe storage (current schema V2)" : "Sales safe storage V1", () => {
  const version = index + 1;
  const config: WorkspaceConfig<Data> = { version, label: index ? "Member" : "Sales", initial: () => ({ version, records: [{ id: "demo" }] }), empty: () => ({ version, records: [] }), valid: (value): value is Data => Boolean(value && typeof value === "object" && "records" in value && Array.isArray(value.records)) };
  it("loads current valid data without adding dates or overwriting formatting", () => {
    const storage = memory(), raw = JSON.stringify({ version, records: [{ id: "legacy" }] }, null, 2);
    storage.setItem(key, raw);
    const loaded = readWorkspace(storage, key, config);
    expect(loaded.issue).toBe(""); expect(loaded.state.records[0]).toEqual({ id: "legacy" }); expect(storage.getItem(key)).toBe(raw);
  });
  it("retains the exact damaged JSON and exposes empty recovery state, not demo", () => {
    const storage = memory(); storage.setItem(key, "{damaged");
    const loaded = readWorkspace(storage, key, config);
    expect(loaded.issue).toContain("原始数据已保留"); expect(loaded.state.records).toEqual([]); expect(storage.getItem(key)).toBe("{damaged");
  });
  it("preserves unknown future versions", () => {
    const storage = memory(), raw = '{"version":99,"records":[{"id":"future"}]}'; storage.setItem(key, raw);
    expect(readWorkspace(storage, key, config).issue).toContain("版本不兼容"); expect(storage.getItem(key)).toBe(raw);
  });
  it("preserves unknown/missing versions", () => {
    const storage = memory(), raw = '{"records":[]}'; storage.setItem(key, raw);
    expect(readWorkspace(storage, key, config).issue).toContain("版本不兼容"); expect(storage.getItem(key)).toBe(raw);
  });
  it("preserves structurally invalid JSON", () => {
    const storage = memory(), raw = JSON.stringify({ version, records: null }); storage.setItem(key, raw);
    expect(readWorkspace(storage, key, config).issue).toContain("结构无法读取"); expect(storage.getItem(key)).toBe(raw);
  });
  it("only initializes a missing namespace", () => {
    const storage = memory(), loaded = readWorkspace(storage, key, config);
    expect(loaded.state.records[0].id).toBe("demo"); expect(storage.getItem(key)).toBeNull();
    expect(saveWorkspace(storage, key, loaded.state, loaded.raw).ok).toBe(true);
  });
  it("explicit reset recovers only its own key and preserves other workspaces", () => {
    const storage = memory(); storage.setItem(key, "damaged"); storage.setItem(keys[1 - index], "other-custom-data"); storage.setItem("kivisense-marketing-prototype-v1", "marketing-custom-data");
    expect(saveWorkspace(storage, key, config.initial(), "damaged", true).ok).toBe(true);
    expect(JSON.parse(storage.getItem(key)!).records[0].id).toBe("demo"); expect(storage.getItem(keys[1 - index])).toBe("other-custom-data"); expect(storage.getItem("kivisense-marketing-prototype-v1")).toBe("marketing-custom-data");
  });
  it("rejects intervening edits instead of overwriting them", () => {
    const storage = memory(); storage.setItem(key, "newer-user-edit");
    expect(saveWorkspace(storage, key, config.initial(), "old-raw").ok).toBe(false); expect(storage.getItem(key)).toBe("newer-user-edit");
  });
  it("failed saves retain the exact original value", () => {
    const storage = memory(); storage.setItem(key, "original");
    const broken = { getItem: storage.getItem, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(saveWorkspace(broken, key, config.initial(), "original").ok).toBe(false); expect(storage.getItem(key)).toBe("original");
  });
  it("unavailable storage does not claim demo data is loaded", () => {
    const storage = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } };
    const loaded = readWorkspace(storage, key, config); expect(loaded.issue).toContain("无法访问"); expect(loaded.state.records).toEqual([]);
  });
});

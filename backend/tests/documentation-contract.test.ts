import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativeUrl: string) => readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
const schema = read("../prisma/schema.prisma");
const operations = read("../../docs/OPERATIONS.md");
const deployment = read("../../docs/DEPLOYMENT.md");
const gatewayMapping = read("../../docs/SOWIND_GATEWAY_MAPPING.md");
const currentDocs = [
  read("../../README.md"),
  read("../../docs/API.md"),
  operations,
  read("../../docs/HANDOFF.md"),
  deployment,
  gatewayMapping,
].join("\n");

function schemaEnum(name: string): string[] {
  const body = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`))?.[1];
  if (!body) throw new Error(`Missing Prisma enum ${name}`);
  return body.split("\n").map((line) => line.trim().split(/\s+/)[0]).filter(Boolean) as string[];
}

function documentedStatusSet(label: string): string[] {
  const line = deployment.match(new RegExp(`当前 ${label} runtime status set：([^\\n]+)`))?.[1];
  if (!line) throw new Error(`Missing documented ${label} runtime status set`);
  return [...line.matchAll(/`([A-Z_]+)`/g)].map((match) => match[1]!);
}

describe("repository documentation contracts", () => {
  it("uses the physical IntegrationOutbox columns in the operations SQL", () => {
    expect(operations).toContain("SELECT id, entity_id, status, attempts, next_retry_at");
    expect(operations).not.toMatch(/\baggregate_id\b|\bavailable_at\b/);
  });

  it("documents only fields and messages emitted by the current Worker", () => {
    expect(operations).not.toContain("event=outbox");
    for (const value of [
      "outbox delivery started", "outbox delivery completed", "recovered stale outbox leases",
      "workerId", "outboxId", "leadId", "brand", "status", "durationMs", "recovered",
    ]) expect(operations).toContain(value);
  });

  it("keeps documented runtime status sets equal to the Prisma enums", () => {
    expect(documentedStatusSet("Lead")).toEqual(schemaEnum("LeadSyncStatus"));
    expect(documentedStatusSet("Outbox")).toEqual(schemaEnum("OutboxStatus"));
  });

  it("does not reintroduce legacy runtime status names in current handoff docs", () => {
    for (const legacy of ["GATEWAY_QUEUED", "CRM_CONFIRMED", "FAILED_AUTH", "FAILED_PERMANENT"]) {
      expect(currentDocs).not.toContain(legacy);
    }
  });

  it("distinguishes optional Lead Phone from required verified Member mobile", () => {
    expect(gatewayMapping).toContain("Lead：Email、称谓、名字、姓氏、首选联系方式、国家、个人数据处理同意为必填；Phone 可选");
    expect(gatewayMapping).toContain("Phone 缺省或空白时完全省略 `phone` field");
    expect(gatewayMapping).toContain("Member 必须使用可信 WeChat 流程验证的手机号");
  });

  it("maps a valid Gateway HTTP 202 only to GATEWAY_ACCEPTED", () => {
    expect(gatewayMapping).toContain("本地 Lead 状态写为 `GATEWAY_ACCEPTED`");
    expect(gatewayMapping).toContain("不表示 HQ CRM Contact 已最终创建");
    expect(gatewayMapping).toContain("不表示 HubSpot 最终处理成功");
  });
});

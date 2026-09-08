#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "frontend-react", "src");
const dictionaryPath = join(sourceRoot, "lib", "product-language.ts");
const reportPath = join(root, "artifacts", "product-language-audit", "report.md");

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else if ([".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.endsWith(".test.ts")) result.push(path);
  }
  return result;
}

const checks = [
  { id: "PL-001", severity: "error", pattern: /Contact 360/g, message: "联系人页面仍显示技术产品名 Contact 360" },
  { id: "PL-002", severity: "error", pattern: /[\"'`]Phone[\"'`]/g, message: "中文业务界面仍使用 Phone" },
  { id: "PL-003", severity: "error", pattern: /[\"'`]Convention[\"'`]/g, message: "联系人类型仍显示原始枚举 Convention" },
  { id: "PL-004", severity: "error", pattern: /操作代码|对象 ID|操作者 ID/g, message: "审计筛选仍显示技术字段名" },
  { id: "PL-005", severity: "error", pattern: /孵化中|无效 \/ 不跟进/g, message: "线索状态未使用统一产品语言" },
  { id: "PL-006", severity: "error", pattern: /销售机会 Pipeline/g, message: "商机看板仍显示中英混合技术标题" },
  { id: "PL-007", severity: "error", pattern: /\|\|\s*(?:item|row\.original)\.(?:status|stage)/g, message: "枚举缺失时可能直接回显原始代码" },
];

const requiredDictionaryExports = [
  "marketingLeadStatusLabels",
  "opportunityStageLabels",
  "organizationLifecycleLabels",
  "organizationRoleLabels",
  "contactTypeLabels",
  "scoreLevelLabels",
  "priorityLabels",
  "engagementStateLabels",
  "auditActionLabels",
  "dataJobStatusLabels",
  "productEventText",
];

const findings = [];
for (const file of await filesUnder(sourceRoot)) {
  if (file === dictionaryPath) continue;
  const source = await readFile(file, "utf8");
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    for (const match of source.matchAll(check.pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      findings.push({ ...check, file: relative(root, file), line, excerpt: match[0] });
    }
  }
}

const dictionary = await readFile(dictionaryPath, "utf8");
for (const name of requiredDictionaryExports) {
  if (!dictionary.includes(`export const ${name}`) && !dictionary.includes(`export function ${name}`)) {
    findings.push({ id: "PL-008", severity: "error", file: relative(root, dictionaryPath), line: 1, excerpt: name, message: "统一产品语言字典缺少必需导出" });
  }
}

const errors = findings.filter((finding) => finding.severity === "error");
const now = new Date().toISOString();
const rows = findings.length
  ? findings.map((finding) => `| ${finding.id} | ${finding.severity.toUpperCase()} | \`${finding.file}:${finding.line}\` | ${finding.message}（\`${finding.excerpt}\`） |`).join("\n")
  : "| — | — | — | 未发现受控产品语言问题 |";
const report = `# Product Language Audit Report\n\n- Generated: ${now}\n- Scope: \`frontend-react/src/**/*.{ts,tsx}\`（排除测试与集中字典本身）\n- Dictionary: \`frontend-react/src/lib/product-language.ts\`\n- Verdict: **${errors.length ? "FAIL" : "PASS"}**\n- Findings: ${findings.length}\n\n| ID | Severity | Location | Finding |\n| --- | --- | --- | --- |\n${rows}\n\n## Guardrails\n\n- API、数据库和审计存储代码保持不变。\n- 普通业务页面只显示统一产品语言；技术代码仅可出现在明确标识的管理员技术字段。\n- 本报告是静态语言护栏，不替代浏览器视觉与交互检查。\n`;

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, report, "utf8");
console.log(`Product language audit: ${errors.length ? "FAIL" : "PASS"} (${findings.length} findings)`);
console.log(relative(root, reportPath));
if (errors.length) process.exitCode = 1;

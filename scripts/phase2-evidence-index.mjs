import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const out = resolve("docs/qa-evidence-shadcn-phase2");
const suites = ["phase2a-browser-results.json", "phase2bc-browser-results.json", "phase2d-browser-results.json", "phase2e-browser-results.json", "phase2-files-jobs-delete-results.json", "phase2-responsive-company-results.json"];
const results = await Promise.all(suites.map(async file => ({ file, ...JSON.parse(await readFile(resolve(out, file), "utf8")) })));
for (const result of results) {
  assert.deepEqual(result.errors, [], result.file);
  assert.deepEqual(result.network, [], result.file);
  assert.ok(result.checks.every(c => c.status === "PASS"), result.file);
}
await mkdir(resolve(out, "resolved"), { recursive: true });
for (const file of await readdir(out)) {
  if (/failure\.(json|png)$/.test(file)) await rename(resolve(out, file), resolve(out, "resolved", file));
}
const screenshots = (await readdir(out)).filter(f => /^\d.*\.png$/.test(f)).sort();
assert.ok(screenshots.length >= 17);
const manifest = [];
for (const file of screenshots) {
  const bytes = await readFile(resolve(out, file));
  manifest.push({ file, sha256: createHash("sha256").update(bytes).digest("hex"), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), checks: results.flatMap(r => r.checks).filter(c => c.name === file.slice(0, -4)) });
}
await writeFile(resolve(out, "screenshot-manifest.json"), JSON.stringify(manifest, null, 2));
await writeFile(resolve(out, "suite-summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "Local real Chrome / built React / Fastify / isolated MySQL", suites: results.map(r => ({ file: r.file, checks: r.checks.length, status: "PASS", errors: 0, unexpectedNetworkFailures: 0 })), totalChecks: results.reduce((n, r) => n + r.checks.length, 0), screenshots: screenshots.length }, null, 2));
const introductions = `# Phase 2 — Browser Evidence\n\nReal browser, real local business APIs, isolated test data. No mutation suite runs on UAT. All screenshot URLs use local QA; their entity IDs identify the test record created or opened during that scenario, not a production record. Run mutation suites individually, at least one minute apart, to respect the unchanged server request/login limits.\n\n## Scenario map\n\nCompany creation and company-scoped contact selection → Contact 360 → create a linked Lead → requirement text/files → followup → current task completion and next task → Contact/Company journey. IDs and exact URL transitions are in each result JSON. File-job tests additionally create an Organization → Contact → Lead from real XLSX imports, verify exported rows, upload/download matching bytes, then soft-delete only those disposable records.\n\n1. Company: list/filter; inspect overview/journey/tasks; create task and company-scoped contact; separately validate Company form, edit, Logo and files.\n2. Contact: create from company selector; switch tabs and save; open 360; edit and verify persistence.\n3. Lead: fuzzy-search contact email; create text plus attachment; edit; add followup and next action; assert task persistence and journey event.\n4. Operations: inspect four pools; create task and nurture; postpone, record followup, verify current task completed/new task created, then complete it; open Supplier as Company.\n5. System: login; create/edit/disable/enable/reset disposable account; inspect/save unchanged role policy; inspect audit; first-login change password; SALES/VIEWER navigation and hidden actions.\n6. Jobs/files/deletion: download templates, preview/execute imports, parse exports; text/PNG/WebM upload/download byte comparison; named file and row deletion.\n7. Responsive: three widths, detailed measurements in manifest and results. Table-internal scrolling is intentional.\n\n## Results\n\n| Suite | Checks | Result |\n| --- | ---: | --- |\n`;
let doc = introductions + results.map(r => `| [${r.file}](${r.file}) | ${r.checks.length} | PASS |`).join("\n") + "\n\n## Ordered screenshots\n\nScreenshots capture actual intermediate states; some include deliberately triggered validation feedback. The manifest records dimensions, hashes and scenario URLs. See [issues](issues.md) for historical failed runs and their retests.\n";
for (const file of screenshots) doc += `\n### ${file.slice(0, -4)}\n\n![${file.slice(0, -4)}](${file})\n`;
await writeFile(resolve(out, "evidence.md"), doc);
console.log(JSON.stringify({ suites: results.length, checks: results.reduce((n, r) => n + r.checks.length, 0), screenshots: screenshots.length }));

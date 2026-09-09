import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  FileBlob,
  SpreadsheetFile,
  Workbook,
} from "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const outputPath = resolve(process.argv[2] || "qa-contact-import.xlsx");
const previewPath = outputPath.replace(/\.xlsx$/i, ".png");
const artifactSourcePath = outputPath.replace(/\.xlsx$/i, ".artifact-source.xlsx");
const execFileAsync = promisify(execFile);
const suffix = process.env.QA_IMPORT_SUFFIX || String(Date.now()).slice(-10);
const contactName = `QA-Semi-Import-${suffix}`;
const email = `qa-semi-import-${suffix}@example.test`;

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("联系人");
sheet.showGridLines = false;
sheet.freezePanes.freezeRows(1);

sheet.getRange("A1:E2").values = [
  ["contactName", "contactType", "email", "source", "remark"],
  [contactName, "INDIVIDUAL", email, "Semi UI QA", "受控单行导入；验收完成后软删除。"],
];

sheet.getRange("A1:E2").format.font = { name: "Arial", size: 10, color: "#1C1F1E" };
sheet.getRange("A1:E1").format = {
  fill: "#1F5D50",
  font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
  horizontalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#17483E" },
};
sheet.getRange("A2:E2").format.verticalAlignment = "center";
sheet.getRange("A2:E2").format.borders = {
  bottom: { style: "thin", color: "#D9E2DE" },
};
sheet.getRange("A1:E1").format.rowHeight = 24;
sheet.getRange("A2:E2").format.rowHeight = 24;
sheet.getRange("A:A").format.columnWidth = 24;
sheet.getRange("B:B").format.columnWidth = 18;
sheet.getRange("C:C").format.columnWidth = 34;
sheet.getRange("D:D").format.columnWidth = 18;
sheet.getRange("E:E").format.columnWidth = 36;

workbook.recalculate();
const inspection = await workbook.inspect({
  kind: "region",
  sheetId: "联系人",
  range: "A1:E2",
  maxChars: 3000,
});
assert.match(inspection.ndjson, new RegExp(contactName));
assert.match(inspection.ndjson, /INDIVIDUAL/);

const preview = await workbook.render({
  sheetName: "联系人",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(artifactSourcePath);

// Normalize the exported OOXML so the CRM server's ExcelJS parser can read it.
const conversionDir = await fs.mkdtemp(join(tmpdir(), "kivisense-import-"));
try {
  await execFileAsync(
    "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice",
    ["--headless", "--convert-to", "xlsx", "--outdir", conversionDir, artifactSourcePath],
  );
  await fs.copyFile(join(conversionDir, basename(artifactSourcePath)), outputPath);
} finally {
  await fs.rm(conversionDir, { recursive: true, force: true });
  await fs.rm(artifactSourcePath, { force: true });
}

const normalizedWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const normalizedInspection = await normalizedWorkbook.inspect({
  kind: "region",
  sheetId: "联系人",
  range: "A1:E2",
  maxChars: 3000,
});
assert.match(normalizedInspection.ndjson, new RegExp(contactName));
assert.match(normalizedInspection.ndjson, /INDIVIDUAL/);
const normalizedPreview = await normalizedWorkbook.render({
  sheetName: "联系人",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await normalizedPreview.arrayBuffer()));

const metadata = {
  outputPath,
  previewPath,
  sheetName: "联系人",
  contactName,
  email,
  rows: 1,
};
await fs.writeFile(outputPath.replace(/\.xlsx$/i, ".json"), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify(metadata));

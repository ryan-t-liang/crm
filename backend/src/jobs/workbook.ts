import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImportJobRow } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../common/errors.js";

type ParsedWorkbook = {
  headers: string[];
  rows: Array<{ rowNumber: number; values: Record<string, string> }>;
};

export function fileSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
  if (typeof value === "object" && "richText" in value) return value.richText.map((item) => item.text).join("").trim();
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  return String(value).trim();
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new ApiError(400, "INVALID_XLSX", "无法读取 XLSX 文件");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, "INVALID_XLSX", "工作簿没有可读取的工作表");
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = cellText(cell.value).replace(/\s*\*$/, "").trim();
  });
  const rows: ParsedWorkbook["rows"] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) values[header] = cellText(row.getCell(index + 1).value);
    });
    if (Object.values(values).some((value) => value !== "")) rows.push({ rowNumber, values });
  });
  return { headers, rows };
}

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function writeFailureCsv(
  app: FastifyInstance,
  jobId: string,
  rows: Array<{ row: ImportJobRow; errorCode: string; errorMessage: string }>,
) {
  if (!rows.length) return null;
  const allHeaders = [...new Set(rows.flatMap((item) => Object.keys(item.row.rawData as Record<string, unknown>)))];
  const lines = [
    ["original_row_number", "business_identifier", "error_code", "error_message", ...allHeaders].map(csvCell).join(","),
    ...rows.map(({ row, errorCode, errorMessage }) => {
      const raw = row.rawData as Record<string, unknown>;
      return [row.rowNumber, row.identity ?? "", errorCode, errorMessage, ...allHeaders.map((header) => raw[header] ?? "")].map(csvCell).join(",");
    }),
  ];
  const directory = join(app.config.storageDir, "imports", "failures");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${jobId}-failures.csv`);
  await writeFile(path, `\uFEFF${lines.join("\r\n")}`, "utf8");
  return path;
}

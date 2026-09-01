import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { formalImportFields, formalTemplateFilename } from "../src/jobs/formal-schema.js";
import { templateWorkbook } from "../src/jobs/import-export.service.js";

async function inspect(objectType: "CUSTOMER" | "LEAD", brand: "GP" | "UN") {
  const buffer = await templateWorkbook(objectType, brand);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0]!;
  const fields = formalImportFields(objectType, brand);
  const headers = fields.map((_, index) => {
    const value = sheet.getCell(1, index + 1).value;
    return value && typeof value === "object" && "richText" in value ? value.richText.map((item) => item.text).join("") : String(value ?? "");
  });
  return { workbook, sheet, fields, headers };
}

describe("Round 3 formal XLSX contracts", () => {
  for (const [objectType, brand, count, filename] of [
    ["CUSTOMER", "GP", 21, "member_GP_import_template.xlsx"],
    ["CUSTOMER", "UN", 22, "member_UN_import_template.xlsx"],
    ["LEAD", "GP", 20, "lead_GP_purchase-intent_template.xlsx"],
    ["LEAD", "UN", 21, "lead_UN_purchase-intent_template.xlsx"],
  ] as const) {
    it(`${filename} has the formal schema and workbook controls`, async () => {
      const { workbook, sheet, fields, headers } = await inspect(objectType, brand);
      expect(formalTemplateFilename(objectType, brand)).toBe(filename);
      expect(fields).toHaveLength(count);
      expect(headers).toHaveLength(count);
      expect(headers).toEqual(fields.map((field) => `${field.label}${field.required ? " *" : ""}`));
      expect(workbook.worksheets.map((item) => item.name)).toContain("填写说明");
      expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
      expect(sheet.autoFilter).toBeTruthy();
      const phone = fields.findIndex((field) => field.key === (objectType === "CUSTOMER" ? "mobile" : "phone"));
      expect(sheet.getColumn(phone + 1).numFmt).toBe("@");
      const required = fields.findIndex((field) => field.required);
      const requiredValue = sheet.getCell(1, required + 1).value as ExcelJS.CellRichTextValue;
      expect(requiredValue.richText.at(-1)?.text).toContain("*");
      expect(requiredValue.richText.at(-1)?.font?.color?.argb).toBe("FFD32F2F");
      if (objectType === "LEAD") expect(fields.find((field) => field.key === "phone")?.required).toBe(false);
    });
  }
});

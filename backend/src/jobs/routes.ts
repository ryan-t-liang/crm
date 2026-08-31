import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendAudit } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { resolveBrand, visibleBrandIds } from "../common/brand.js";
import { ApiError } from "../common/errors.js";
import { customerNumber, jobNumber } from "../common/ids.js";
import { normalizeMobile } from "../common/mobile.js";
import { createCanonicalLead } from "../leads/service.js";

type FormField = { key: string; label: string; type: string; required?: boolean; options?: string[]; localOnly?: boolean };

function parseFields(schemaJson: Prisma.JsonValue): FormField[] {
  if (!schemaJson || typeof schemaJson !== "object" || Array.isArray(schemaJson)) return [];
  const fields = (schemaJson as { fields?: unknown }).fields;
  return Array.isArray(fields) ? fields as FormField[] : [];
}

function filenameHeader(filename: string): string {
  return `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`;
}

async function templateWorkbook(brandName: string, objectLabel: string, fields: FormField[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sowind CRM";
  const sheet = workbook.addWorksheet(`${brandName}${objectLabel}导入`);
  fields.forEach((field, index) => {
    const cell = sheet.getCell(1, index + 1);
    cell.value = field.required
      ? { richText: [{ text: field.label, font: { bold: true, color: { argb: "FF222222" } } }, { text: " *", font: { bold: true, color: { argb: "FFD32F2F" } } }] }
      : field.label;
    cell.font = { bold: true, color: { argb: "FF222222" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F1EC" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD6D3CD" } } };
    sheet.getColumn(index + 1).width = Math.max(14, Math.min(28, field.label.length * 2 + 4));
    const example: Record<string, string | boolean> = {
      salutation: "Ms", last_name: "张", first_name: "一二", mobile: "+8613812345678", email: "member@example.cn",
      birthday: "1990-08-18", country: "China", province: "上海市", city: "上海", postal_code: "200040",
      address_line: "上海市静安区示例路 1 号", language: "简体中文", preferred_contact: "WeChat", owns_brand_watch: "Yes",
      interest_center: "制表工艺", favorite_collection: "FREAK", marketing_opt_in: "Yes", processing_consent: "Yes",
      firstname: "一二", lastname: "张", phone: "+8613812345678", preferredContact: "WeChat", sku: "81010-11-3475-1CM",
      ownsBrandWatch: "Yes", marketingOptIn: "Yes", processingConsent: "Yes", purchaseMethod: "品牌精品店", retailer: "上海精品店",
    };
    sheet.getCell(2, index + 1).value = example[field.key] ?? "";
    if (["mobile", "phone", "postal_code"].includes(field.key)) {
      sheet.getColumn(index + 1).numFmt = "@";
      sheet.getCell(2, index + 1).numFmt = "@";
    }
    if (field.options?.length) {
      sheet.getCell(2, index + 1).dataValidation = { type: "list", allowBlank: !field.required, formulae: [`"${field.options.join(",")}"`] };
    }
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 24;
  const note = workbook.addWorksheet("填写说明");
  note.columns = [{ width: 20 }, { width: 70 }];
  note.addRow(["标记", "说明"]); note.addRow(["红色 *", "必填字段；未标记 * 的字段为非必填字段"]); note.addRow(["手机号", "已按文本格式设置，必须保留国家码与 + 号，避免 Excel 显示为科学计数法"]);
  note.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
  if (typeof value === "object" && "richText" in value) return value.richText.map((item) => item.text).join("").trim();
  return String(value).trim();
}

function yes(value: unknown): boolean { return ["yes", "true", "1", "是", "同意"].includes(String(value ?? "").trim().toLowerCase()); }
function required(row: Record<string, string>, key: string): string {
  const value = row[key]?.trim();
  if (!value) throw new ApiError(400, "VALIDATION_ERROR", `${key}为必填项`);
  return value;
}

async function readRows(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, "INVALID_FILE", "工作簿没有可读取的工作表");
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => { headers[column - 1] = cellText(cell.value).replace(/\s*\*$/, ""); });
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item: Record<string, string> = {};
    headers.forEach((header, index) => { if (header) item[header] = cellText(row.getCell(index + 1).value); });
    if (Object.values(item).some(Boolean)) rows.push(item);
  });
  return rows;
}

async function activeForm(app: FastifyInstance, brandId: string, objectType: "CUSTOMER" | "LEAD") {
  const form = await app.prisma.formDefinition.findFirst({ where: { brandId, objectType, active: true }, orderBy: { effectiveAt: "desc" } });
  if (!form) throw new ApiError(404, "RESOURCE_NOT_FOUND", "没有可用的表单配置");
  return form;
}

export async function importExportRoutes(app: FastifyInstance): Promise<void> {
  for (const objectType of ["customers", "leads"] as const) {
    app.get(`/api/v1/templates/${objectType}`, { preHandler: guard(objectType === "customers" ? "customer.import" : "lead.import") }, async (request, reply) => {
      const query = z.object({ brandCode: z.string() }).parse(request.query);
      const brand = await resolveBrand(app, request, query.brandCode);
      const form = await activeForm(app, brand.id, objectType === "customers" ? "CUSTOMER" : "LEAD");
      const buffer = await templateWorkbook(brand.name, objectType === "customers" ? "会员" : "线索", parseFields(form.schemaJson));
      const filename = `${objectType === "customers" ? "member" : "lead"}_${brand.code}_import_template.xlsx`;
      return reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", filenameHeader(filename)).send(buffer);
    });

    app.post(`/api/v1/imports/${objectType}`, { preHandler: guard(objectType === "customers" ? "customer.import" : "lead.import") }, async (request, reply) => {
      const query = z.object({ brandCode: z.string(), conflictStrategy: z.enum(["SKIP", "UPDATE"]).default("SKIP") }).parse(request.query);
      const brand = await resolveBrand(app, request, query.brandCode);
      const upload = await request.file();
      if (!upload || !upload.filename.toLowerCase().endsWith(".xlsx")) throw new ApiError(400, "INVALID_FILE", "请上传 .xlsx 文件");
      const buffer = await upload.toBuffer();
      const rows = await readRows(buffer);
      if (rows.length > 5000) throw new ApiError(400, "IMPORT_LIMIT_EXCEEDED", "单次导入最多 5000 行");
      const form = await activeForm(app, brand.id, objectType === "customers" ? "CUSTOMER" : "LEAD");
      const fields = parseFields(form.schemaJson);
      const byLabel = new Map(fields.map((field) => [field.label, field.key]));
      const normalizedRows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([label, value]) => [byLabel.get(label) ?? label, value])));
      await mkdir(join(app.config.storageDir, "imports"), { recursive: true });
      const jobNo = jobNumber("IMP");
      const storedName = `${jobNo}-${basename(upload.filename).replace(/[^A-Za-z0-9._-]/g, "_")}`;
      const storagePath = join(app.config.storageDir, "imports", storedName);
      await writeFile(storagePath, buffer);
      const job = await app.prisma.importJob.create({ data: { jobNo, objectType: objectType === "customers" ? "CUSTOMER" : "LEAD", brandId: brand.id, subtype: objectType === "leads" ? "PURCHASE_INTENT" : null, fileName: upload.filename, storagePath, conflictStrategy: query.conflictStrategy, status: "PROCESSING", totalCount: normalizedRows.length, createdBy: request.auth!.userId } });
      let successCount = 0; let failedCount = 0; let skippedCount = 0;
      for (const [index, row] of normalizedRows.entries()) {
        try {
          for (const field of fields.filter((item) => item.required)) if (!String(row[field.key] ?? "").trim()) throw new ApiError(400, "VALIDATION_ERROR", `${field.label}为必填项`);
          const createdId = await app.prisma.$transaction(async (tx) => {
            if (objectType === "leads") {
              const created = await createCanonicalLead(tx, app.config, {
                brandCode: brand.code as "GP" | "UN", source: "BATCH_IMPORT", submissionMode: "BATCH_IMPORT", formVersion: form.version,
                sku: required(row, "sku"), email: required(row, "email"), salutation: required(row, "salutation"), firstname: required(row, "firstname"), lastname: required(row, "lastname"), phone: required(row, "phone"),
                preferredContact: required(row, "preferredContact"), country: required(row, "country"), city: row.city || null, ownsBrandWatch: row.ownsBrandWatch || null,
                birthday: row.birthday ? new Date(row.birthday) : null, purchaseMethod: row.purchaseMethod || null, retailer: row.retailer || null,
                processingConsent: true, marketingOptIn: yes(row.marketingOptIn), originalSnapshot: row, createdBy: request.auth!.userId,
                idempotencyKey: `IMPORT:${job.id}:${index + 2}`,
              });
              return created.lead.id;
            }
            const mobile = required(row, "mobile");
            const lastName = required(row, "last_name");
            const firstName = required(row, "first_name");
            const normalized = normalizeMobile(mobile);
            let customer = await tx.customer.findUnique({ where: { mobileNormalized: normalized } });
            if (!customer) customer = await tx.customer.create({ data: { customerNo: customerNumber(), displayName: `${lastName}${firstName}`, mobile, mobileNormalized: normalized, createdBy: request.auth!.userId } });
            const existingProfile = await tx.customerBrandProfile.findUnique({ where: { customerId_brandId: { customerId: customer.id, brandId: brand.id } } });
            if (existingProfile && query.conflictStrategy === "SKIP") { skippedCount += 1; return existingProfile.id; }
            const data = { displayName: `${lastName}${firstName}`, salutation: row.salutation, lastName, firstName, email: row.email?.toLowerCase() || null, mobile, birthday: row.birthday ? new Date(row.birthday) : null, country: row.country || null, region: row.province || null, city: row.city || null, postalCode: row.postal_code || null, addressLine: row.address_line || null, language: row.language || null, preferredContact: row.preferred_contact || null, ownsBrandWatch: yes(row.owns_brand_watch), interestCenter: row.interest_center || null, favoriteCollection: row.favorite_collection || null, registrationSource: "BATCH_IMPORT", registeredAt: new Date(), registrationData: row };
            const profile = existingProfile ? await tx.customerBrandProfile.update({ where: { id: existingProfile.id }, data }) : await tx.customerBrandProfile.create({ data: { ...data, customerId: customer.id, brandId: brand.id } });
            return profile.id;
          });
          await app.prisma.importJobRow.create({ data: { importJobId: job.id, rowNumber: index + 2, status: "SUCCEEDED", rawData: row, createdId } });
          successCount += 1;
        } catch (error) {
          failedCount += 1;
          await app.prisma.importJobRow.create({ data: { importJobId: job.id, rowNumber: index + 2, status: "FAILED", rawData: row, errors: { message: error instanceof Error ? error.message : String(error) } } });
        }
      }
      const status = failedCount === 0 ? "COMPLETED" : successCount > 0 ? "PARTIAL" : "FAILED";
      await app.prisma.$transaction(async (tx) => {
        await tx.importJob.update({ where: { id: job.id }, data: { status, successCount, failedCount, skippedCount, completedAt: new Date() } });
        await appendAudit(tx, request, { action: "IMPORT_COMPLETED", module: "import", targetType: "import_job", targetId: job.id, brandId: brand.id, details: { objectType, successCount, failedCount, skippedCount } });
      });
      return reply.status(202).send({ data: { id: job.id, jobNo, status, totalCount: normalizedRows.length, successCount, failedCount, skippedCount } });
    });
  }

  app.get<{ Params: { id: string } }>("/api/v1/imports/:id", { preHandler: guard() }, async (request) => {
    const ids = visibleBrandIds(request);
    const job = await app.prisma.importJob.findFirst({ where: { id: request.params.id, ...(ids ? { brandId: { in: ids } } : {}) }, include: { rows: { orderBy: { rowNumber: "asc" }, take: 500 } } });
    if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "导入任务不存在或超出品牌范围");
    return { data: job };
  });

  for (const objectType of ["customers", "leads"] as const) {
    app.post(`/api/v1/exports/${objectType}`, { preHandler: guard(objectType === "customers" ? "customer.export" : "lead.export") }, async (request, reply) => {
      const body = z.object({ brandCode: z.string().optional() }).parse(request.body ?? {});
      const ids = visibleBrandIds(request);
      const brand = body.brandCode ? await resolveBrand(app, request, body.brandCode) : null;
      const brandWhere = brand ? { brandId: brand.id } : ids ? { brandId: { in: ids } } : {};
      const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet(objectType === "customers" ? "会员" : "线索");
      let rowCount = 0;
      if (objectType === "customers") {
        sheet.columns = [{ header: "会员 ID", key: "customerNo", width: 22 }, { header: "姓名", key: "displayName", width: 20 }, { header: "手机号", key: "mobile", width: 22 }, { header: "品牌", key: "brand", width: 16 }, { header: "品牌 Email", key: "email", width: 30 }, { header: "注册时间", key: "createdAt", width: 22 }];
        const rows = await app.prisma.customer.findMany({ where: { profiles: { some: brandWhere } }, include: { profiles: { where: brandWhere, include: { brand: true } } }, orderBy: { createdAt: "desc" } });
        rows.forEach((customer) => customer.profiles.forEach((profile) => { sheet.addRow({ customerNo: customer.customerNo, displayName: customer.displayName, mobile: customer.mobile, brand: profile.brand.name, email: profile.email || "", createdAt: customer.createdAt.toISOString().replace("T", " ").slice(0, 19) }); rowCount += 1; }));
      } else {
        sheet.columns = [{ header: "线索编号", key: "leadNo", width: 28 }, { header: "品牌", key: "brand", width: 16 }, { header: "姓名", key: "name", width: 20 }, { header: "手机号", key: "phone", width: 22 }, { header: "Email", key: "email", width: 30 }, { header: "产品", key: "sku", width: 25 }, { header: "同步状态", key: "status", width: 18 }, { header: "创建时间", key: "createdAt", width: 22 }];
        const rows = await app.prisma.lead.findMany({ where: brandWhere, include: { brand: true }, orderBy: { createdAt: "desc" } });
        rows.forEach((lead) => { sheet.addRow({ leadNo: lead.leadNo, brand: lead.brand.name, name: `${lead.lastname}${lead.firstname}`, phone: lead.phone, email: lead.email, sku: lead.sku || "", status: lead.syncStatus, createdAt: lead.createdAt.toISOString().replace("T", " ").slice(0, 19) }); rowCount += 1; });
      }
      sheet.getRow(1).font = { bold: true }; sheet.getRow(1).alignment = { vertical: "middle" }; sheet.views = [{ state: "frozen", ySplit: 1 }];
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      await mkdir(join(app.config.storageDir, "exports"), { recursive: true });
      const jobNo = jobNumber("EXP"); const fileName = `${objectType}-${jobNo}.xlsx`; const storagePath = join(app.config.storageDir, "exports", fileName); await writeFile(storagePath, buffer);
      const job = await app.prisma.$transaction(async (tx) => {
        const row = await tx.exportJob.create({ data: { jobNo, objectType: objectType === "customers" ? "CUSTOMER" : "LEAD", brandId: brand?.id, status: "COMPLETED", requestJson: body, fileName, storagePath, rowCount, createdBy: request.auth!.userId, completedAt: new Date() } });
        await appendAudit(tx, request, { action: "EXPORT_COMPLETED", module: "export", targetType: "export_job", targetId: row.id, brandId: brand?.id, details: { objectType, rowCount } });
        return row;
      });
      return reply.status(201).send({ data: { ...job, downloadUrl: `/api/v1/exports/${job.id}/download` } });
    });
  }

  app.get<{ Params: { id: string } }>("/api/v1/exports/:id/download", { preHandler: guard() }, async (request, reply) => {
    const ids = visibleBrandIds(request);
    const job = await app.prisma.exportJob.findFirst({ where: { id: request.params.id, createdBy: request.auth!.userId, ...(ids ? { OR: [{ brandId: null }, { brandId: { in: ids } }] } : {}) } });
    if (!job?.storagePath || !job.fileName) throw new ApiError(404, "RESOURCE_NOT_FOUND", "导出文件不存在或无权下载");
    const buffer = await readFile(job.storagePath);
    return reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", filenameHeader(job.fileName)).send(buffer);
  });
}

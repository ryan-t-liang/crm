/** One code per text line, or a one-column CSV (optional code/兑换码 header).
 * Reject ambiguous multi-column input rather than importing names as codes. */
export function parseMarketingCodeRows(text: string): string[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const codes = lines.map((line) => {
    if (line.startsWith('"')) {
      if (!/^"(?:[^"\r\n]|"")*"$/.test(line)) throw new Error("CSV仅支持一列兑换码，不接受多列或跨行值");
      return line.slice(1, -1).replaceAll('""', '"').trim();
    }
    if (line.includes(",")) throw new Error("CSV仅支持一列兑换码；请移除其他列");
    return line;
  });
  if (/^(code|兑换码)$/i.test(codes[0] || "")) codes.shift();
  return codes;
}

export interface MarketingCodeImportReport {
  imported: number; duplicate: number; invalid: number; ignored: number;
  failures: { line: number; code: string; reason: string }[];
}
// A frontend input safeguard, not an assertion about a third-party code format.
export const validMarketingCode = (code: string) => code.length > 0 && code.length <= 128 && !/[\s\x00-\x1f\x7f<>"']/.test(code);
export function inspectMarketingCodes(rows: string[], existing: Iterable<string> = []) {
  const seen = new Set(existing), codes: string[] = [];
  const report: MarketingCodeImportReport = { imported: 0, duplicate: 0, invalid: 0, ignored: 0, failures: [] };
  rows.forEach((raw, index) => {
    const code = raw.trim();
    if (!code) { report.ignored++; return; }
    let reason = "";
    if (!validMarketingCode(code)) { report.invalid++; reason = "长度须为1–128，不能含空白、控制字符或明显非法字符"; }
    else if (seen.has(code)) { report.duplicate++; reason = "批次内或已有兑换码中重复"; }
    else { codes.push(code); seen.add(code); }
    if (reason) report.failures.push({ line: index + 1, code, reason });
  });
  report.imported = codes.length;
  return { codes, report };
}
/** Strict legacy parser retained for callers requiring all-or-nothing parsing. */
export function parseMarketingCodes(text: string): string[] {
  const rows = parseMarketingCodeRows(text), { codes, report } = inspectMarketingCodes(rows);
  if (!codes.length || report.duplicate || report.invalid) throw new Error("兑换码为空、重复或非法；整批未导入");
  return codes;
}

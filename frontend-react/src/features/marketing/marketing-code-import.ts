/** One code per text line, or a one-column CSV (optional code/兑换码 header).
 * Reject ambiguous multi-column input rather than importing names as codes. */
export function parseMarketingCodes(text: string): string[] {
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
  if (!codes.length || codes.some((code) => !code) || new Set(codes).size !== codes.length) throw new Error("兑换码为空或重复；整批未导入");
  return codes;
}

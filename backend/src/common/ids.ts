import { randomBytes } from "node:crypto";

function compactDate(date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export function customerNumber(sequence: bigint | number): string {
  const value = BigInt(sequence);
  if (value < 1n || value > 99_999_999n) throw new RangeError("Customer number sequence is out of range");
  return `SW${value.toString().padStart(8, "0")}`;
}

export function leadNumber(brandCode: string): string {
  return `PI-${brandCode}-${compactDate()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function jobNumber(prefix: "IMP" | "EXP"): string {
  return `${prefix}-${compactDate()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

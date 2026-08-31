import { randomBytes } from "node:crypto";

function compactDate(date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export function customerNumber(): string {
  return `M-${compactDate().slice(0, 4)}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function leadNumber(brandCode: string): string {
  return `PI-${brandCode}-${compactDate()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function jobNumber(prefix: "IMP" | "EXP"): string {
  return `${prefix}-${compactDate()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

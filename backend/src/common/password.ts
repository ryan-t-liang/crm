import { hash, verify } from "@node-rs/argon2";
import { ApiError } from "./errors.js";

const weakPasswords = new Set(["123456789012", "password1234", "qwerty123456", "aaaaaaaaaaaa"]);

export function assertStrongPassword(password: string, initialPassword: string): void {
  const value = String(password || "");
  if (value.length < 12) throw new ApiError(400, "WEAK_PASSWORD", "密码至少需要 12 个字符");
  if (/^\d+$/.test(value) || /^(.)\1{11,}$/.test(value) || weakPasswords.has(value.toLowerCase())) {
    throw new ApiError(400, "WEAK_PASSWORD", "请避免纯数字、连续重复字符或常见弱密码");
  }
  if (value === initialPassword) throw new ApiError(400, "PASSWORD_REUSE", "新密码不能与系统初始密码相同");
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 });
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try { return await verify(hashValue, password); } catch { return false; }
}

import type { DemoUser } from "@/types/crm";

export const DEMO_AUTH_STORAGE_KEY = "kivisense-crm-demo-auth-v1";
export const DEMO_PASSWORD = "kivisense";

export interface DemoAuthSession { authenticated: true; userId: string }

export function readDemoAuthSession(): DemoAuthSession | null {
  try {
    const value = window.localStorage.getItem(DEMO_AUTH_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<DemoAuthSession>;
    return parsed.authenticated === true && typeof parsed.userId === "string" && parsed.userId ? { authenticated: true, userId: parsed.userId } : null;
  } catch { return null; }
}

export function authenticateDemoUser(users: DemoUser[], email: string, password: string): { user?: DemoUser; error?: string } {
  const user = users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || password !== DEMO_PASSWORD) return { error: "账号或密码不正确。" };
  return { user };
}

export function saveDemoAuthSession(userId: string) {
  const session: DemoAuthSession = { authenticated: true, userId };
  window.localStorage.setItem(DEMO_AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearDemoAuthSession() { window.localStorage.removeItem(DEMO_AUTH_STORAGE_KEY); }

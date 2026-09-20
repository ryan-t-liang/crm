// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { authenticateDemoUser, clearDemoAuthSession, DEMO_PASSWORD, readDemoAuthSession, saveDemoAuthSession } from "./auth-session";

describe("frontend demo login session", () => {
  beforeEach(() => window.localStorage.clear());
  it("accepts a known demo account and persists only the selected user id", () => {
    const users = createDemoState().users;
    expect(authenticateDemoUser(users, "RYAN@KIVISENSE.COM", DEMO_PASSWORD).user?.id).toBe("user-ryan");
    expect(authenticateDemoUser(users, users[0].email, "wrong").error).toBeTruthy();
    saveDemoAuthSession("user-ryan");
    expect(readDemoAuthSession()).toEqual({ authenticated: true, userId: "user-ryan" });
    clearDemoAuthSession();
    expect(readDemoAuthSession()).toBeNull();
  });
});

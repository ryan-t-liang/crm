import { describe, expect, it } from "vitest";
import { brandLabels, brandScopeLabels } from "./brand-display";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";

describe("Kivisense display branding", () => {
  it("uses Kivisense for both existing scopes without merging records", () => {
    const members = createMemberOperationsDemoState(), original = JSON.stringify(members);
    expect(brandLabels.gp).toBe("Kivisense");
    expect(brandLabels.un).toBe("Kivisense");
    expect(brandScopeLabels.gp).not.toBe(brandScopeLabels.un);
    members.brandUsers.forEach(user => expect(brandLabels[user.brand]).toBe("Kivisense"));
    expect(JSON.stringify(members)).toBe(original);
    expect(new Set(members.brandUsers.map(user => user.brand))).toEqual(new Set(["gp", "un"]));
  });
});

import { describe, expect, it } from "vitest";
import { brandLabels, brandScopeLabels } from "./brand-display";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";

describe("Kivisense display branding", () => {
  it("uses the public brand names without changing stored scope codes", () => {
    const members = createMemberOperationsDemoState(), original = JSON.stringify(members);
    expect(brandLabels.gp).toBe("Kivisense");
    expect(brandLabels.un).toBe("Kivicube");
    expect(brandScopeLabels).toEqual({ gp: "Kivisense", un: "Kivicube" });
    members.brandUsers.forEach(user => expect(brandLabels[user.brand]).toBe(user.brand === "gp" ? "Kivisense" : "Kivicube"));
    expect(JSON.stringify(members)).toBe(original);
    expect(new Set(members.brandUsers.map(user => user.brand))).toEqual(new Set(["gp", "un"]));
  });
});

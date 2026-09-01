import { describe, expect, it } from "vitest";
import { redactAuditDetails } from "../src/common/audit.js";
import { normalizePermissionDependencies } from "../src/common/permissions.js";
import { leadInputSchema } from "../src/leads/routes.js";

describe("production readiness shared contracts", () => {
  it("removes child permissions whenever their parent view permission is absent", () => {
    expect(normalizePermissionDependencies(["customer.edit", "customer.export", "lead.view", "lead.edit"]))
      .toEqual(["lead.edit", "lead.view"]);
  });

  it("does not restore historical children when a parent is restored", () => {
    expect(normalizePermissionDependencies(["customer.view"]))
      .toEqual(["customer.view"]);
  });

  it("recursively redacts passwords, gateway keys, app secrets, tokens, auth codes and HMAC material", () => {
    expect(redactAuditDetails({
      password: "secret", gatewayAccessKey: "key", nested: { appSecret: "secret", token: "token", authCode: "code", hmacSignature: "sig", safe: "visible" },
    })).toEqual({
      password: "[REDACTED]", gatewayAccessKey: "[REDACTED]", nested: { appSecret: "[REDACTED]", token: "[REDACTED]", authCode: "[REDACTED]", hmacSignature: "[REDACTED]", safe: "visible" },
    });
  });

  it("accepts empty optional Lead birthday and phone values from the browser form", () => {
    const result = leadInputSchema.parse({
      brandCode: "UN", sku: "2405-500-2A/3C", email: "lead@example.invalid", salutation: "Ms",
      firstname: "Lead", lastname: "UAT", phone: "", preferredContact: "Email", country: "China",
      ownsBrandWatch: "No", birthday: "", processingConsent: true, marketingOptIn: false,
    });
    expect(result.birthday).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });
});

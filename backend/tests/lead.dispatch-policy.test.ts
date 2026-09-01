import { describe, expect, it } from "vitest";
import { shouldAutoDispatchLead } from "../src/leads/service.js";

describe("Lead source dispatch policy", () => {
  it("auto-dispatches only mini-program submissions", () => {
    expect(shouldAutoDispatchLead({ source: "MINI_PROGRAM", submissionMode: "USER_SUBMITTED" })).toBe(true);
    expect(shouldAutoDispatchLead({ source: "MINI_PROGRAM", submissionMode: "EXTERNAL_API" })).toBe(true);
    expect(shouldAutoDispatchLead({ source: "WECHAT_MINIPROGRAM", submissionMode: "USER_SUBMITTED" })).toBe(true);
  });

  it("keeps admin and import submissions local until manual sync", () => {
    expect(shouldAutoDispatchLead({ source: "ADMIN_MANUAL", submissionMode: "ADMIN_MANUAL" })).toBe(false);
    expect(shouldAutoDispatchLead({ source: "BATCH_IMPORT", submissionMode: "BATCH_IMPORT" })).toBe(false);
    expect(shouldAutoDispatchLead({ source: "MINI_PROGRAM", submissionMode: "ADMIN_MANUAL" })).toBe(false);
    expect(shouldAutoDispatchLead({ source: "MINI_PROGRAM", submissionMode: "BATCH_IMPORT" })).toBe(false);
  });

  it("does not dispatch non-purchase-intent leads", () => {
    expect(shouldAutoDispatchLead({ leadType: "GENERAL_INQUIRY", source: "MINI_PROGRAM", submissionMode: "USER_SUBMITTED" })).toBe(false);
  });
});

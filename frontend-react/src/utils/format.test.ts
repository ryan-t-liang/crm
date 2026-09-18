import { expect, it } from "vitest";
import { date, dateTime } from "./format";
it.each([undefined, "", "invalid legacy date"])("missing/invalid date %s is unavailable, never today or a rendering exception", (value) => {
  expect(date(value)).toBe("—"); expect(dateTime(value)).toBe("—");
});
it("valid stored timestamps remain readable without changing their value", () => {
  const value = "2026-09-18T01:00:00Z";
  expect(date(value)).not.toBe("—"); expect(dateTime(value)).not.toBe("—"); expect(value).toBe("2026-09-18T01:00:00Z");
});

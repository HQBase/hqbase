import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  defaultPersonalAccessTokenExpiry,
  formatDateTimeLocal,
  personalAccessTokenExpiryToIso
} from "@/features/personal-access-tokens/expiry";

const priorTimeZone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/Chicago";
});

afterAll(() => {
  if (priorTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = priorTimeZone;
});

describe("personal access token expiry", () => {
  it("formats and parses datetime-local values in the current time zone", () => {
    const instant = new Date("2026-01-15T18:30:00.000Z");
    const local = formatDateTimeLocal(instant);

    expect(local).toBe("2026-01-15T12:30");
    expect(local).not.toBe(instant.toISOString().slice(0, 16));
    expect(personalAccessTokenExpiryToIso(local)).toBe(instant.toISOString());
    expect(personalAccessTokenExpiryToIso("")).toBeNull();
  });

  it("uses a 90-day default", () => {
    const now = new Date("2026-01-15T18:30:00.000Z");
    const expected = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(defaultPersonalAccessTokenExpiry(now.getTime())).toBe(formatDateTimeLocal(expected));
  });
});

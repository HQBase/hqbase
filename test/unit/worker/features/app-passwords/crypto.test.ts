import { describe, expect, it } from "vitest";

import {
  appPasswordHash,
  appPasswordId,
  createAppPassword,
  secureHashEqual
} from "../../../../../worker/features/app-passwords/crypto";

describe("app-password crypto", () => {
  it("creates a structured high-entropy password whose identifier can be parsed", () => {
    const id = "apw_00000000-0000-4000-8000-000000000001";
    const password = createAppPassword(id);
    expect(password).toMatch(/^hqp_apw_[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}$/);
    expect(appPasswordId(password)).toBe(id);
    expect(appPasswordId("ordinary-password")).toBeNull();
  });

  it("uses the deployment pepper and compares hashes without early exit", async () => {
    const first = await appPasswordHash("password", "pepper-one");
    const same = await appPasswordHash("password", "pepper-one");
    const different = await appPasswordHash("password", "pepper-two");
    expect(secureHashEqual(first, same)).toBe(true);
    expect(secureHashEqual(first, different)).toBe(false);
    expect(secureHashEqual(first, `${same}0`)).toBe(false);
  });
});

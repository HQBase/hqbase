import { createMailboxSchema } from "@worker/features/mailboxes/validation";
import { requireMailboxDomain } from "@worker/lib/validation";
import { describe, expect, it } from "vitest";

describe("mailbox validation", () => {
  it("normalizes mailbox addresses", () => {
    const parsed = createMailboxSchema.parse({
      address: "Support@Example.com",
      displayName: "Support"
    });

    expect(parsed.address).toBe("support@example.com");
  });

  it("rejects addresses outside the primary domain", () => {
    expect(() => requireMailboxDomain("hello@other.com", "example.com")).toThrow(
      "Mailbox address must use example.com."
    );
  });
});

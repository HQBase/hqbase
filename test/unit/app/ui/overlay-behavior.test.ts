import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mailboxDetails = readFileSync(
  new URL("../../../../app/features/mailboxes/mailbox-details-sheet.tsx", import.meta.url),
  "utf8"
);
const tailwind = readFileSync(new URL("../../../../tailwind.config.ts", import.meta.url), "utf8");

describe("overlay behavior", () => {
  it("moves right sheets off-screen once when they close", () => {
    expect(tailwind).toMatch(
      /"sheet-out-right": \{\s*from: \{ transform: "translateX\(0\)" \},\s*to: \{ transform: "translateX\(100%\)" \}/
    );
  });

  it("keeps mailbox status changes out of the details sheet", () => {
    expect(mailboxDetails).not.toContain("Mailbox status");
    expect(mailboxDetails).not.toContain("onToggle");
  });
});

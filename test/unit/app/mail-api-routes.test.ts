import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("web Mail API routing", () => {
  it("uses the stable v2 API for mail while keeping mailbox administration internal", () => {
    const mailSources = [
      "app/features/messages/api.ts",
      "app/features/messages/conversation-messages.tsx",
      "app/features/drafts/api.ts",
      "app/features/compose/api.ts"
    ].map(read);
    for (const source of mailSources) {
      expect(source).toContain("/api/v2/");
      expect(source).not.toContain("/api/v1/");
      expect(source).not.toMatch(
        /\/api\/(?:messages|conversations|attachments|drafts|send|reply)/u
      );
    }

    const mailboxes = read("app/features/mailboxes/api.ts");
    expect(mailboxes).toContain('apiGet<Mailbox[]>("/api/v2/mailboxes")');
    expect(mailboxes).toContain('apiPost<Mailbox>("/api/mailboxes", input)');
    expect(mailboxes).not.toContain("/addresses");
  });
});

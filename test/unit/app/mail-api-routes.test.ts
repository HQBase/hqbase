import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appRoutePath, readAppRoute, settingsTabs } from "@/lib/routes";

const read = (path: string) => readFileSync(path, "utf8");

describe("web Mail API routing", () => {
  it("routes every signed-in role to API settings", () => {
    expect(settingsTabs).toContain("api");
    expect(readAppRoute("https://mail.example.com/settings/api")).toEqual({
      kind: "settings",
      tab: "api"
    });
    expect(appRoutePath({ kind: "settings", tab: "api" })).toBe("/settings/api");
  });

  it("uses the stable v1 API for mail while keeping mailbox administration internal", () => {
    const mailSources = [
      "app/features/messages/api.ts",
      "app/features/messages/conversation-messages.tsx",
      "app/features/drafts/api.ts",
      "app/features/compose/api.ts"
    ].map(read);
    for (const source of mailSources) {
      expect(source).toContain("/api/v1/");
      expect(source).not.toMatch(
        /\/api\/(?:messages|conversations|attachments|drafts|send|reply)/u
      );
    }

    const mailboxes = read("app/features/mailboxes/api.ts");
    expect(mailboxes).toContain('apiGet<Mailbox[]>("/api/v1/mailboxes")');
    expect(mailboxes).toContain('apiPost<Mailbox>("/api/mailboxes", input)');
  });
});

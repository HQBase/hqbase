import { describe, expect, it } from "vitest";
import { type AppRoute, appRoutePath, mailFolders, readAppRoute, settingsTabs } from "@/lib/routes";

describe("application routing", () => {
  it("gives every mail folder a canonical route", () => {
    for (const folder of mailFolders) {
      const path = `/mail/${folder.path}`;
      expect(readAppRoute(path)).toEqual({ kind: "mail", folder: folder.id, messageId: null });
      expect(appRoutePath(readAppRoute(path))).toBe(path);
    }
  });

  it("round-trips an opened message in every mail folder", () => {
    for (const folder of mailFolders) {
      const route: AppRoute = { kind: "mail", folder: folder.id, messageId: "message/one" };
      const path = appRoutePath(route);
      expect(path).toBe(`/mail/${folder.path}/message%2Fone`);
      expect(readAppRoute(path)).toEqual(route);
    }
  });

  it("round-trips the Drafts folder and a selected private draft", () => {
    expect(readAppRoute("/mail/drafts")).toEqual({ kind: "drafts", draftId: null });
    expect(readAppRoute("/drafts")).toEqual({ kind: "drafts", draftId: null });
    const route: AppRoute = { kind: "drafts", draftId: "draft/one" };
    expect(appRoutePath(route)).toBe("/mail/drafts/draft%2Fone");
    expect(readAppRoute(appRoutePath(route))).toEqual(route);
  });

  it("gives every Settings page a canonical route", () => {
    for (const tab of settingsTabs) {
      const path = `/settings/${tab}`;
      expect(readAppRoute(path)).toEqual({ kind: "settings", tab });
      expect(appRoutePath(readAppRoute(path))).toBe(path);
    }
  });

  it("round-trips the contacts page and an exact correspondent", () => {
    expect(readAppRoute("/contacts")).toEqual({ kind: "contacts", contactId: null });
    const route: AppRoute = { kind: "contacts", contactId: "friend@example.com" };
    expect(appRoutePath(route)).toBe("/contacts/friend%40example.com");
    expect(readAppRoute(appRoutePath(route))).toEqual(route);
  });

  it("normalizes every Agents alias to one canonical route", () => {
    for (const path of [
      "/agents",
      "/agents/connections",
      "/agents/mailboxes",
      "/agents/provisioning",
      "/settings/mcp",
      "/settings/agents"
    ]) {
      expect(readAppRoute(path)).toEqual({ kind: "agents" });
      expect(appRoutePath(readAppRoute(path))).toBe("/agents");
    }
  });

  it("keeps OAuth return aliases and retired Settings pages compatible", () => {
    expect(readAppRoute("/?cloudflare=connected&settings=domains")).toEqual({
      kind: "settings",
      tab: "domains"
    });
    expect(readAppRoute("/?settings=updates")).toEqual({ kind: "settings", tab: "updates" });
    for (const path of ["/settings/debug", "/settings/general"]) {
      expect(readAppRoute(path)).toEqual({ kind: "settings", tab: "mailboxes" });
    }
    for (const path of ["/settings/interface", "/settings/notifications"]) {
      expect(readAppRoute(path)).toEqual({ kind: "settings", tab: "preferences" });
      expect(appRoutePath(readAppRoute(path))).toBe("/settings/preferences");
    }
    expect(readAppRoute("/catchall")).toEqual({
      kind: "mail",
      folder: "catchall",
      messageId: null
    });
    expect(readAppRoute("/mail/inbox")).toEqual({ kind: "mail", folder: "inbox", messageId: null });
    expect(readAppRoute("/mail/catch-all")).toEqual({
      kind: "mail",
      folder: "catchall",
      messageId: null
    });
  });

  it("normalizes root and unknown paths to the inbox", () => {
    const inbox = { kind: "mail", folder: "inbox", messageId: null };
    expect(readAppRoute("/")).toEqual(inbox);
    expect(readAppRoute("/not-a-screen")).toEqual(inbox);
    expect(readAppRoute("/settings/not-a-page")).toEqual({
      kind: "settings",
      tab: "mailboxes"
    });
  });
});

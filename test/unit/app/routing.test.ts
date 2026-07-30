import { describe, expect, it } from "vitest";
import { type AppRoute, appRoutePath, mailFolders, readAppRoute, settingsTabs } from "@/lib/routes";

describe("application routing", () => {
  it("gives every mail folder a canonical route", () => {
    for (const folder of mailFolders) {
      const path = `/${folder.path}`;
      expect(readAppRoute(path)).toEqual({ kind: "mail", folder: folder.id, messageId: null });
      expect(appRoutePath(readAppRoute(path))).toBe(path);
    }
  });

  it("round-trips an opened message in every mail folder", () => {
    for (const folder of mailFolders) {
      const route: AppRoute = { kind: "mail", folder: folder.id, messageId: "message/one" };
      const path = appRoutePath(route);
      expect(path).toBe(`/${folder.path}/message%2Fone`);
      expect(readAppRoute(path)).toEqual(route);
    }
  });

  it("round-trips the Drafts folder and a selected private draft", () => {
    expect(readAppRoute("/drafts")).toEqual({ kind: "drafts", draftId: null });
    const route: AppRoute = { kind: "drafts", draftId: "draft/one" };
    expect(appRoutePath(route)).toBe("/drafts/draft%2Fone");
    expect(readAppRoute(appRoutePath(route))).toEqual(route);
  });

  it("gives every Settings page a canonical route", () => {
    for (const tab of settingsTabs) {
      const path = `/settings/${tab}`;
      expect(readAppRoute(path)).toEqual({ kind: "settings", tab });
      expect(appRoutePath(readAppRoute(path))).toBe(path);
    }
  });

  it("keeps OAuth return aliases and the retired General tab compatible", () => {
    expect(readAppRoute("/?cloudflare=connected&settings=domains")).toEqual({
      kind: "settings",
      tab: "domains"
    });
    expect(readAppRoute("/?settings=updates")).toEqual({ kind: "settings", tab: "updates" });
    expect(readAppRoute("/settings/general")).toEqual({ kind: "settings", tab: "debug" });
    expect(readAppRoute("/catchall")).toEqual({
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

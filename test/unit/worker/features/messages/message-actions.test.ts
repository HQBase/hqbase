import { buildMessageActionPatch } from "@worker/features/messages/actions";
import { describe, expect, it } from "vitest";

describe("buildMessageActionPatch", () => {
  it("marks messages read and unread", () => {
    expect(buildMessageActionPatch("read", "now")).toEqual({ readAt: "now" });
    expect(buildMessageActionPatch("unread", "now")).toEqual({ readAt: null });
  });

  it("moves archive and trash folders", () => {
    expect(buildMessageActionPatch("archive", "now")).toMatchObject({ folder: "archived" });
    expect(buildMessageActionPatch("trash", "now")).toMatchObject({ folder: "trash" });
  });
});

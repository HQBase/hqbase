import { searchDestinations } from "@worker/features/search/service";
import { describe, expect, it } from "vitest";

describe("global search destinations", () => {
  it("keeps owner and management destinations out of member results", () => {
    expect(searchDestinations("catch", "member", 5)).toEqual([]);
    expect(searchDestinations("updates", "member", 5)).toEqual([]);
    expect(searchDestinations("catch", "owner", 5)).toEqual([
      expect.objectContaining({ id: "catch-all", path: "/mail/catch-all" })
    ]);
    expect(searchDestinations("release", "admin", 5)).toEqual([
      expect.objectContaining({ id: "updates", path: "/settings/updates" })
    ]);
  });

  it("matches literal destination terms and respects the group limit", () => {
    expect(searchDestinations("mail", "member", 2)).toEqual([
      expect.objectContaining({ id: "mailboxes" }),
      expect.objectContaining({ id: "inbox" })
    ]);
  });
});

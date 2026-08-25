// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import {
  draftRecoveryKey,
  legacyDraftRecoveryKey,
  migrateDraftRecovery,
  readNewestDraftRecovery
} from "@/features/compose/compose-state";

const serverUpdatedAt = "2026-08-24T12:00:00.000Z";

function recovery(subject: string, savedAt: number): string {
  return JSON.stringify({
    from: "support@example.com",
    to: "reader@example.net",
    cc: "",
    bcc: "",
    subject,
    text: "Local body",
    html: "<p>Local body</p>",
    savedAt
  });
}

beforeEach(() => localStorage.clear());

describe("composer recovery key migration", () => {
  it.each([
    {
      label: "new message",
      key: legacyDraftRecoveryKey("new", null, null),
      expected: "hqbase:compose:new:new"
    },
    {
      label: "reply",
      key: legacyDraftRecoveryKey("reply", null, "message-1"),
      expected: "hqbase:compose:reply:message-1"
    },
    {
      label: "saved draft",
      key: legacyDraftRecoveryKey("new", "draft-1", null),
      expected: "hqbase:compose:new:draft-1"
    }
  ])("reads $label data from its released legacy key", ({ key, expected }) => {
    expect(key).toBe(expected);
    localStorage.setItem(key, recovery("Legacy edit", Date.parse(serverUpdatedAt) + 1));

    expect(
      readNewestDraftRecovery([draftRecoveryKey("draft-1"), key], serverUpdatedAt)?.subject
    ).toBe("Legacy edit");
  });

  it("chooses the newest valid payload across exact and legacy keys", () => {
    const exactKey = draftRecoveryKey("draft-1");
    const legacyKey = legacyDraftRecoveryKey("new", "draft-1", null);
    localStorage.setItem(exactKey, recovery("Exact but older", Date.parse(serverUpdatedAt) + 1));
    localStorage.setItem(legacyKey, recovery("Legacy but newer", Date.parse(serverUpdatedAt) + 2));

    expect(readNewestDraftRecovery([exactKey, legacyKey], serverUpdatedAt)?.subject).toBe(
      "Legacy but newer"
    );
  });

  it("moves the winning legacy payload to its exact draft key without later resurrection", () => {
    const exactKey = draftRecoveryKey("draft-1");
    const nextExactKey = draftRecoveryKey("draft-2");
    const legacyKey = legacyDraftRecoveryKey("new", null, null);
    localStorage.setItem(legacyKey, recovery("Legacy edit", Date.parse(serverUpdatedAt) + 1));
    const selected = readNewestDraftRecovery([exactKey, legacyKey], serverUpdatedAt);

    migrateDraftRecovery(exactKey, legacyKey, selected);

    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(readNewestDraftRecovery([exactKey, legacyKey], serverUpdatedAt)?.subject).toBe(
      "Legacy edit"
    );
    expect(readNewestDraftRecovery([nextExactKey, legacyKey], serverUpdatedAt)).toBeNull();
  });
});

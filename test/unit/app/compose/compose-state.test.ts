import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readDraftRecovery,
  sendingIdentities,
  splitRecipients
} from "@/features/compose/compose-state";

afterEach(() => vi.unstubAllGlobals());

describe("composer state", () => {
  it("normalizes recipient input", () => {
    expect(splitRecipients("one@example.com, two@example.com\nthree@example.com")).toEqual([
      "one@example.com",
      "two@example.com",
      "three@example.com"
    ]);
  });

  it("exposes every send-enabled identity on an authorized mailbox", () => {
    expect(
      sendingIdentities([
        {
          id: "mbx_1",
          address: "support@example.com",
          displayName: "Support",
          isActive: true,
          accessLevel: "agent",
          createdAt: "now",
          updatedAt: "now",
          addresses: [
            {
              id: "addr_1",
              mailboxId: "mbx_1",
              mailDomainId: "dom_1",
              address: "support@example.com",
              displayName: "Support",
              receiveEnabled: true,
              sendEnabled: true,
              isPrimary: true
            },
            {
              id: "addr_2",
              mailboxId: "mbx_1",
              mailDomainId: "dom_2",
              address: "help@example.net",
              displayName: "Support",
              receiveEnabled: true,
              sendEnabled: false,
              isPrimary: false
            }
          ]
        }
      ])
    ).toEqual([{ mailboxId: "mbx_1", address: "support@example.com" }]);
  });

  it("uses crash recovery only when it is newer than the server draft", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          from: "a@example.com",
          to: "",
          cc: "",
          bcc: "",
          subject: "Recovered",
          text: "Body",
          html: "<p>Body</p>",
          savedAt: 200
        })
    });
    expect(readDraftRecovery("key", new Date(100).toISOString())).toMatchObject({
      subject: "Recovered"
    });
    expect(readDraftRecovery("key", new Date(300).toISOString())).toBeNull();
  });
});

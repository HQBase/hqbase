import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultSendingIdentity,
  findDraftForComposer,
  forwardedMessage,
  normalizeDraftHtml,
  readDraftRecovery,
  replySendingIdentity,
  sendingIdentities,
  serializeDraft,
  splitRecipients
} from "@/features/compose/compose-state";
import type { Draft } from "@/features/drafts/types";

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
        },
        {
          id: "mbx_2",
          address: "sales@example.net",
          displayName: "Sales",
          isActive: true,
          accessLevel: "manager",
          createdAt: "now",
          updatedAt: "now",
          addresses: [
            {
              id: "addr_3",
              mailboxId: "mbx_2",
              mailDomainId: "dom_2",
              address: "sales@example.net",
              displayName: "Sales",
              receiveEnabled: true,
              sendEnabled: true,
              isPrimary: true
            }
          ]
        }
      ])
    ).toEqual([
      { mailboxId: "mbx_1", address: "support@example.com" },
      { mailboxId: "mbx_2", address: "sales@example.net" }
    ]);
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

  it("reopens the exact selected draft when several new-message drafts exist", () => {
    const draft = (id: string): Draft => ({
      id,
      mailboxId: "mbx_1",
      replyToMessageId: null,
      forwardOfMessageId: null,
      from: "support@example.com",
      to: [],
      cc: [],
      bcc: [],
      subject: id,
      text: "",
      html: "",
      version: 1,
      updatedAt: "2026-07-29T14:00:00.000Z",
      attachments: []
    });
    const drafts = [draft("draft-one"), draft("draft-two")];

    expect(findDraftForComposer(drafts, "draft-two", null, null)?.id).toBe("draft-two");
    expect(findDraftForComposer(drafts, "missing", null, null)).toBeNull();
  });

  it("uses the exact address that received the message as the reply identity", () => {
    const identity = replySendingIdentity(
      {
        id: "msg_1",
        threadId: "thr_1",
        mailboxId: "mbx_1",
        direction: "inbound",
        folder: "inbox",
        fromAddress: "sender@example.com",
        to: ["alias@example.com"],
        cc: [],
        bcc: [],
        deliveredToAddress: "alias@example.com",
        subject: "Account access",
        snippet: "Please help",
        textBody: "Please help",
        htmlAvailable: false,
        messageId: "<msg@example.com>",
        inReplyTo: null,
        references: [],
        attachments: [],
        receivedAt: "2026-07-27T14:00:00.000Z",
        sentAt: null,
        readAt: null,
        starredAt: null,
        hasAttachments: false,
        createdAt: "2026-07-27T14:00:00.000Z"
      },
      [
        { mailboxId: "mbx_1", address: "support@example.com" },
        { mailboxId: "mbx_1", address: "alias@example.com" }
      ],
      { mailboxId: "mbx_2", address: "privacy@example.com" }
    );

    expect(identity).toEqual({ mailboxId: "mbx_1", address: "alias@example.com" });
  });

  it("uses the preferred mailbox primary address for new messages", () => {
    const mailboxes = [
      {
        id: "mbx_1",
        address: "support@example.com",
        displayName: "Support",
        isActive: true,
        accessLevel: "manager" as const,
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
          }
        ]
      },
      {
        id: "mbx_2",
        address: "privacy@example.com",
        displayName: "Privacy",
        isActive: true,
        accessLevel: "agent" as const,
        createdAt: "now",
        updatedAt: "now",
        addresses: [
          {
            id: "addr_2",
            mailboxId: "mbx_2",
            mailDomainId: "dom_1",
            address: "privacy@example.com",
            displayName: "Privacy",
            receiveEnabled: true,
            sendEnabled: true,
            isPrimary: true
          }
        ]
      }
    ];
    const identities = sendingIdentities(mailboxes);

    expect(defaultSendingIdentity("mbx_2", mailboxes, identities)).toEqual({
      mailboxId: "mbx_2",
      address: "privacy@example.com"
    });
  });

  it("treats empty editor markup as the canonical empty draft", () => {
    expect(normalizeDraftHtml("", "<p></p>")).toBe("");
    expect(serializeDraft("from@example.com", "", "", "", "", "", "<p></p>")).toBe(
      serializeDraft("from@example.com", "", "", "", "", "", "")
    );
  });

  it("builds safe forwarded context from the selected message", () => {
    const forwarded = forwardedMessage({
      id: "msg_1",
      threadId: "thr_1",
      mailboxId: "mbx_1",
      direction: "inbound",
      folder: "inbox",
      fromAddress: "sender@example.com",
      to: ["support@example.com"],
      cc: [],
      bcc: [],
      deliveredToAddress: "support@example.com",
      subject: "Account access",
      snippet: "Please help",
      textBody: "Please help <script>alert(1)</script>",
      htmlAvailable: false,
      messageId: "<msg@example.com>",
      inReplyTo: null,
      references: [],
      attachments: [],
      receivedAt: "2026-07-27T14:00:00.000Z",
      sentAt: null,
      readAt: null,
      starredAt: null,
      hasAttachments: false,
      createdAt: "2026-07-27T14:00:00.000Z"
    });

    expect(forwarded.text).toContain("---------- Forwarded message ---------");
    expect(forwarded.text).toContain("From: sender@example.com");
    expect(forwarded.html).toContain("&lt;script&gt;");
    expect(forwarded.html).not.toContain("<script>");
  });
});

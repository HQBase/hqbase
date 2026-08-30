import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composeContextLabel,
  defaultSendingIdentity,
  draftEditorHtml,
  draftRecoveryKey,
  findDraftForComposer,
  forwardedMessage,
  hasInvalidRecipients,
  invalidRecipients,
  normalizeDraftHtml,
  readDraftRecovery,
  replyRecipients,
  replySendingIdentity,
  sendingIdentities,
  serializeDraft,
  splitRecipients
} from "@/features/compose/compose-state";
import type { Draft } from "@/features/drafts/types";
import type { MessageDetail } from "@/features/messages/types";

afterEach(() => vi.unstubAllGlobals());

describe("composer state", () => {
  it("normalizes recipient input", () => {
    expect(splitRecipients("one@example.com, two@example.com\nthree@example.com")).toEqual([
      "one@example.com",
      "two@example.com",
      "three@example.com"
    ]);
    expect(invalidRecipients("one@example.com, unfinished")).toEqual(["unfinished"]);
    expect(hasInvalidRecipients("one@example.com", "", "two@example.com")).toBe(false);
    expect(hasInvalidRecipients("one@example.com", "unfinished", "")).toBe(true);
  });

  it("exposes one identity for every authorized active mailbox", () => {
    expect(
      sendingIdentities([
        {
          id: "mbx_1",
          address: "support@example.com",
          mailDomainId: "dom_1",
          displayName: "Support",
          kind: "human",
          isActive: true,
          deletedAt: null,
          accessLevel: "agent",
          createdAt: "now",
          updatedAt: "now"
        },
        {
          id: "mbx_2",
          address: "sales@example.net",
          mailDomainId: "dom_2",
          displayName: "Sales",
          kind: "human",
          isActive: true,
          deletedAt: null,
          accessLevel: "manager",
          createdAt: "now",
          updatedAt: "now"
        }
      ])
    ).toEqual([
      { mailboxId: "mbx_1", address: "support@example.com", displayName: "Support" },
      { mailboxId: "mbx_2", address: "sales@example.net", displayName: "Sales" }
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
      signature: { mode: "automatic", id: null, name: "", html: "", text: "" },
      version: 1,
      updatedAt: "2026-07-29T14:00:00.000Z",
      attachments: [],
      labels: []
    });
    const drafts = [draft("draft-one"), draft("draft-two")];

    expect(findDraftForComposer(drafts, "draft-two", null, null)?.id).toBe("draft-two");
    expect(findDraftForComposer(drafts, "missing", null, null)).toBeNull();
    expect(findDraftForComposer(drafts, null, null, null)).toBeNull();
    expect(draftRecoveryKey(drafts[0]?.id ?? "")).not.toBe(draftRecoveryKey(drafts[1]?.id ?? ""));
  });

  it("uses the mailbox that received the message as the reply identity", () => {
    const inboundMessage: MessageDetail = {
      id: "msg_1",
      threadId: "thr_1",
      mailboxId: "mbx_1",
      direction: "inbound",
      folder: "inbox",
      fromAddress: "sender@example.com",
      fromName: "Sender Example",
      to: ["support@example.com"],
      cc: [],
      bcc: [],
      deliveredToAddress: "support@example.com",
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
    };
    const identity = replySendingIdentity(
      inboundMessage,
      [
        { mailboxId: "mbx_1", address: "support@example.com", displayName: "Support" },
        { mailboxId: "mbx_2", address: "privacy@example.com", displayName: "Privacy" }
      ],
      { mailboxId: "mbx_2", address: "privacy@example.com", displayName: "Privacy" }
    );

    expect(identity).toEqual({
      mailboxId: "mbx_1",
      address: "support@example.com",
      displayName: "Support"
    });
    expect(replyRecipients(inboundMessage)).toEqual(["sender@example.com"]);
    expect(composeContextLabel("reply", inboundMessage)).toContain(
      "Replying to Sender Example <sender@example.com> ·"
    );
    expect(composeContextLabel("forward", inboundMessage)).toContain(
      "Forwarding message from Sender Example <sender@example.com> ·"
    );
    expect(composeContextLabel("new", inboundMessage)).toBeNull();
    const outboundMessage = {
      ...inboundMessage,
      direction: "outbound" as const,
      folder: "sent" as const,
      fromAddress: "support@example.com",
      to: ["SUPPORT@example.com", "customer@example.com"],
      receivedAt: null,
      sentAt: "2026-07-27T14:05:00.000Z"
    };
    expect(replyRecipients(outboundMessage)).toEqual(["customer@example.com"]);
    expect(composeContextLabel("reply", outboundMessage)).toContain(
      "Replying to customer@example.com ·"
    );
    expect(
      replyRecipients({
        ...inboundMessage,
        direction: "outbound",
        folder: "sent",
        fromAddress: "support@example.com",
        to: ["support@example.com"],
        receivedAt: null,
        sentAt: "2026-07-27T14:05:00.000Z"
      })
    ).toEqual([]);
  });

  it("uses the preferred mailbox for new messages", () => {
    const mailboxes = [
      {
        id: "mbx_1",
        address: "support@example.com",
        mailDomainId: "dom_1",
        displayName: "Support",
        kind: "human" as const,
        isActive: true,
        deletedAt: null,
        accessLevel: "manager" as const,
        createdAt: "now",
        updatedAt: "now"
      },
      {
        id: "mbx_2",
        address: "privacy@example.com",
        mailDomainId: "dom_1",
        displayName: "Privacy",
        kind: "human" as const,
        isActive: true,
        deletedAt: null,
        accessLevel: "agent" as const,
        createdAt: "now",
        updatedAt: "now"
      }
    ];
    const identities = sendingIdentities(mailboxes);

    expect(defaultSendingIdentity("mbx_2", identities)).toEqual({
      mailboxId: "mbx_2",
      address: "privacy@example.com",
      displayName: "Privacy"
    });
  });

  it("treats empty editor markup as the canonical empty draft", () => {
    expect(normalizeDraftHtml("", "<p></p>")).toBe("");
    expect(serializeDraft("from@example.com", "", "", "", "", "", "<p></p>")).toBe(
      serializeDraft("from@example.com", "", "", "", "", "", "")
    );
  });

  it("safely opens plain-text drafts in the rich editor", () => {
    expect(draftEditorHtml("First <line> & next\nSecond", "<p></p>")).toBe(
      "<p>First &lt;line&gt; &amp; next<br>Second</p>"
    );
    expect(draftEditorHtml("Text fallback", "<p><br></p>")).toBe("<p>Text fallback</p>");
    expect(draftEditorHtml("Text fallback", '<p><img src="cid:image"></p>')).toBe(
      '<p><img src="cid:image"></p>'
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
      fromName: "Sender Example",
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
    expect(forwarded.text).toContain("From: Sender Example <sender@example.com>");
    expect(forwarded.html).toContain("&lt;script&gt;");
    expect(forwarded.html).not.toContain("<script>");
  });
});

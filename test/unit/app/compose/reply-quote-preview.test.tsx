// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { ReplyQuotePreview } from "@/features/compose/reply-quote-preview";
import type { MessageDetail } from "@/features/messages/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const message: MessageDetail = {
  id: "message-1",
  threadId: "thread-1",
  mailboxId: "mailbox-1",
  direction: "inbound",
  folder: "inbox",
  fromAddress: "reader@example.net",
  to: ["support@example.com"],
  cc: [],
  bcc: [],
  deliveredToAddress: "support@example.com",
  subject: "Question",
  snippet: "Original message body",
  textBody: "Original message body",
  htmlAvailable: false,
  messageId: "<message-1@example.net>",
  inReplyTo: null,
  references: [],
  attachments: [],
  receivedAt: "2026-08-24T12:00:00.000Z",
  sentAt: null,
  readAt: null,
  starredAt: null,
  hasAttachments: false,
  createdAt: "2026-08-24T12:00:00.000Z"
};

afterEach(() => document.body.replaceChildren());

describe("reply quote preview", () => {
  it("starts collapsed and reveals each stored message through the reply target", async () => {
    const reply: MessageDetail = {
      ...message,
      id: "message-2",
      direction: "outbound",
      folder: "sent",
      fromAddress: "support@example.com",
      to: ["reader@example.net"],
      deliveredToAddress: null,
      snippet: "Latest reply",
      textBody:
        "Latest reply\n\nOn 2026-08-24 at 12:00 UTC, reader@example.net wrote:\n> Original message body",
      messageId: "<message-2@example.net>",
      inReplyTo: "<message-1@example.net>",
      references: ["<message-1@example.net>"],
      receivedAt: null,
      sentAt: "2026-08-24T12:05:00.000Z",
      createdAt: "2026-08-24T12:05:00.000Z"
    };
    const laterMessage: MessageDetail = {
      ...message,
      id: "message-3",
      snippet: "Later message",
      textBody: "Later message",
      messageId: "<message-3@example.net>",
      inReplyTo: "<message-2@example.net>",
      references: ["<message-1@example.net>", "<message-2@example.net>"],
      receivedAt: "2026-08-24T12:10:00.000Z",
      createdAt: "2026-08-24T12:10:00.000Z"
    };
    const view = await renderComponent(
      <ReplyQuotePreview messages={[message, reply, laterMessage]} target={reply} />
    );
    const disclosure = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Show quoted message history"]'
    );

    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(view.container.querySelector("[data-reply-quote-content]")).toBeNull();
    expect(view.container.textContent).not.toContain("Latest reply");

    await flushHookEffects(() => disclosure?.click());

    expect(
      view.container
        .querySelector('[aria-label="Hide quoted message history"]')
        ?.getAttribute("aria-expanded")
    ).toBe("true");
    const content = view.container.querySelector("[data-reply-quote-content]");
    expect(content?.textContent).toContain("Latest reply");
    expect(content?.textContent).toContain("Original message body");
    expect(
      content?.querySelector(
        '[data-reply-quote-message-id="message-2"] [data-quoted-content-frame]'
      )?.className
    ).toContain("hidden");
    expect(content?.textContent).not.toContain("Later message");
    expect(content?.textContent.indexOf("Latest reply")).toBeLessThan(
      content?.textContent.indexOf("Original message body") ?? -1
    );
    expect(content?.querySelectorAll("[data-reply-quote-message-id]")).toHaveLength(2);
    expect(content?.className).toContain("border-l");
    expect(content?.className).toContain("pl-3");
    expect(view.container.querySelectorAll("[data-quoted-content-control]")).toHaveLength(1);

    await view.unmount();
  });
});

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
  it("starts collapsed and reveals the complete stored chain with one control", async () => {
    const messageWithHistory = {
      ...message,
      textBody:
        "Latest reply\n\nOn 2026-08-24 at 12:00 UTC, reader@example.net wrote:\n\n> Original message body"
    };
    const view = await renderComponent(<ReplyQuotePreview message={messageWithHistory} />);
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
    expect(content?.className).toContain("border-l");
    expect(content?.className).toContain("pl-3");
    expect(view.container.querySelectorAll("[data-quoted-content-control]")).toHaveLength(1);

    await view.unmount();
  });
});

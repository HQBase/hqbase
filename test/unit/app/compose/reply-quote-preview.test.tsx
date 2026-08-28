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
  it("starts collapsed and reveals the replied-to message without changing the draft body", async () => {
    const view = await renderComponent(<ReplyQuotePreview message={message} />);
    const disclosure = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Show quoted message history"]'
    );

    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(view.container.querySelector("[data-reply-quote-content]")).toBeNull();
    expect(view.container.textContent).not.toContain(message.textBody);

    await flushHookEffects(() => disclosure?.click());

    expect(
      view.container
        .querySelector('[aria-label="Hide quoted message history"]')
        ?.getAttribute("aria-expanded")
    ).toBe("true");
    expect(view.container.querySelector("[data-reply-quote-content]")?.textContent).toContain(
      message.textBody
    );

    await view.unmount();
  });
});

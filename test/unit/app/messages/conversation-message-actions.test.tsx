// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { ConversationMessages } from "@/features/messages/conversation-messages";
import type { MessageDetail } from "@/features/messages/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const firstMessage: MessageDetail = {
  id: "msg_1",
  threadId: "thr_1",
  mailboxId: "mbx_1",
  direction: "inbound",
  folder: "inbox",
  fromAddress: "customer@example.com",
  to: ["support@example.com"],
  cc: [],
  bcc: [],
  deliveredToAddress: "support@example.com",
  subject: "Account access",
  snippet: "I cannot sign in",
  textBody: "I cannot sign in.",
  htmlAvailable: false,
  messageId: "<first@example.com>",
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

const secondMessage: MessageDetail = {
  ...firstMessage,
  id: "msg_2",
  direction: "outbound",
  folder: "sent",
  fromAddress: "support@example.com",
  to: ["customer@example.com"],
  textBody: "We can help.",
  snippet: "We can help",
  messageId: "<second@example.com>",
  inReplyTo: "<first@example.com>",
  references: ["<first@example.com>"],
  receivedAt: null,
  sentAt: "2026-07-27T14:05:00.000Z",
  readAt: "2026-07-27T14:05:00.000Z",
  createdAt: "2026-07-27T14:05:00.000Z"
};

describe("conversation message actions", () => {
  it("targets the exact message selected for Reply or Forward", async () => {
    const onCompose = vi.fn();
    const view = await renderComponent(
      <ConversationMessages messages={[firstMessage, secondMessage]} onCompose={onCompose} />
    );

    const firstReply = view.container.querySelector<HTMLButtonElement>(
      '[data-compose-action="reply"][data-compose-message-id="msg_1"]'
    );
    const secondForward = view.container.querySelector<HTMLButtonElement>(
      '[data-compose-action="forward"][data-compose-message-id="msg_2"]'
    );
    await flushHookEffects(() => firstReply?.click());
    await flushHookEffects(() => secondForward?.click());

    expect(onCompose).toHaveBeenNthCalledWith(1, firstMessage, "reply");
    expect(onCompose).toHaveBeenNthCalledWith(2, secondMessage, "forward");

    await view.unmount();
  });

  it("switches the counted thread control between outward and inward arrows", async () => {
    const messages = Array.from({ length: 4 }, (_, index) => ({
      ...firstMessage,
      id: `msg_${index + 1}`,
      textBody: `Message body ${index + 1}`
    }));
    const view = await renderComponent(<ConversationMessages messages={messages} />);
    const control = view.container.querySelector<HTMLButtonElement>(
      "[data-thread-disclosure-state]"
    );

    expect(control?.getAttribute("aria-label")).toBe("Expand 2 earlier messages");
    expect(control?.querySelector('[data-thread-arrow="top-outward"]')).not.toBeNull();
    expect(control?.querySelector('[data-thread-arrow="bottom-outward"]')).not.toBeNull();
    expect(view.container.textContent).not.toContain("Message body 2");

    await flushHookEffects(() => control?.click());

    expect(control?.getAttribute("aria-label")).toBe("Collapse 2 earlier messages");
    expect(control?.getAttribute("data-thread-disclosure-state")).toBe("expanded");
    expect(control?.querySelector('[data-thread-arrow="top-inward"]')).not.toBeNull();
    expect(control?.querySelector('[data-thread-arrow="bottom-inward"]')).not.toBeNull();
    expect(view.container.textContent).toContain("Message body 2");
    expect(view.container.textContent).toContain("Message body 3");

    await view.unmount();
  });
});

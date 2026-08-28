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
  it("replies to the latest inbound message and forwards the last message", async () => {
    const onCompose = vi.fn();
    const view = await renderComponent(
      <ConversationMessages messages={[firstMessage, secondMessage]} onCompose={onCompose} />
    );

    const reply = view.container.querySelector<HTMLButtonElement>(
      '[data-compose-action="reply"][data-compose-message-id="msg_1"]'
    );
    const lastForward = view.container.querySelector<HTMLButtonElement>(
      '[data-compose-action="forward"][data-compose-message-id="msg_2"]'
    );
    expect(
      view.container.querySelector<HTMLElement>('[data-thread-message-id="msg_1"]')?.className
    ).toContain("pt-2");
    expect(
      view.container.querySelector<HTMLElement>('[data-thread-message-id="msg_2"]')?.className
    ).toContain("pt-5");
    await flushHookEffects(() => reply?.click());
    await flushHookEffects(() => lastForward?.click());

    expect(onCompose).toHaveBeenNthCalledWith(1, firstMessage, "reply");
    expect(onCompose).toHaveBeenNthCalledWith(2, secondMessage, "forward");

    await view.unmount();
  });

  it("removes the counted thread control after it reveals the hidden messages", async () => {
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

    expect(view.container.querySelector("[data-thread-messages-control]")).toBeNull();
    expect(view.container.textContent).toContain("Message body 2");
    expect(view.container.textContent).toContain("Message body 3");

    const newMessage = {
      ...firstMessage,
      id: "msg_5",
      textBody: "Message body 5"
    };
    await view.rerender(<ConversationMessages messages={[...messages, newMessage]} />);

    expect(view.container.querySelector("[data-thread-messages-control]")).toBeNull();
    expect(view.container.textContent).toContain("Message body 2");
    expect(view.container.textContent).toContain("Message body 4");

    await view.rerender(
      <ConversationMessages
        messages={[...messages, newMessage].map((message) => ({
          ...message,
          threadId: "thr_2"
        }))}
      />
    );

    expect(view.container.querySelector("[data-thread-messages-control]")).not.toBeNull();

    await view.unmount();
  });

  it("shows quoted-history disclosure on a revealed second-to-last message", async () => {
    const messages = Array.from({ length: 4 }, (_, index) => ({
      ...firstMessage,
      id: `msg_${index + 1}`,
      textBody:
        index === 2
          ? "Current reply\n\nOn Aug 20, 2026, Pat <pat@example.com> wrote:\n\n> Earlier reply"
          : `Message body ${index + 1}`
    }));
    const view = await renderComponent(<ConversationMessages messages={messages} />);
    const threadControl = view.container.querySelector<HTMLButtonElement>(
      "[data-thread-disclosure-state]"
    );

    await flushHookEffects(() => threadControl?.click());

    const secondToLast = view.container.querySelector('[data-thread-message-id="msg_3"]');
    expect(secondToLast?.querySelector("[data-quoted-content-control]")).not.toBeNull();

    await view.unmount();
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("conversation message actions", () => {
  it("targets every expanded message for compose and folder actions", async () => {
    const onCompose = vi.fn();
    const onMessageAction = vi.fn().mockResolvedValue(undefined);
    const view = await renderComponent(
      <ConversationMessages
        messages={[firstMessage, secondMessage]}
        onCompose={onCompose}
        onMessageAction={onMessageAction}
      />
    );
    document.body.appendChild(view.container);

    const firstReply = view.container.querySelector<HTMLButtonElement>(
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
    expect(firstReply?.className).toContain("h-8");
    expect(lastForward?.className).toContain("h-9");
    await flushHookEffects(() => firstReply?.click());
    await flushHookEffects(() => lastForward?.click());

    expect(onCompose).toHaveBeenNthCalledWith(1, firstMessage, "reply");
    expect(onCompose).toHaveBeenNthCalledWith(2, secondMessage, "forward");

    const messageActions = view.container.querySelector<HTMLButtonElement>(
      '[data-message-actions-id="msg_1"]'
    );
    await flushHookEffects(() => {
      messageActions?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      messageActions?.click();
    });
    const menu = document.body.querySelector<HTMLElement>('[data-message-actions-menu="msg_1"]');
    expect(menu?.textContent).toContain("Archive message");
    expect(menu?.textContent).toContain("Move message to Trash");
    await flushHookEffects(() =>
      menu?.querySelector<HTMLElement>('[data-message-action="archive"]')?.click()
    );
    expect(onMessageAction).toHaveBeenCalledWith(firstMessage, "archive");

    await view.unmount();
  });

  it("offers Restore instead of Archive or Trash for one trashed message", async () => {
    const trashedMessage = { ...firstMessage, folder: "trash" as const };
    const onMessageAction = vi.fn().mockResolvedValue(undefined);
    const view = await renderComponent(
      <ConversationMessages messages={[trashedMessage]} onMessageAction={onMessageAction} />
    );
    document.body.appendChild(view.container);

    const trigger = view.container.querySelector<HTMLButtonElement>(
      '[data-message-actions-id="msg_1"]'
    );
    await flushHookEffects(() => {
      trigger?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      trigger?.click();
    });
    const menu = document.body.querySelector<HTMLElement>('[data-message-actions-menu="msg_1"]');
    expect(menu?.textContent).toContain("Restore message");
    expect(menu?.textContent).not.toContain("Archive message");
    expect(menu?.textContent).not.toContain("Move message to Trash");
    await flushHookEffects(() =>
      menu?.querySelector<HTMLElement>('[data-message-action="restore"]')?.click()
    );
    expect(onMessageAction).toHaveBeenCalledWith(trashedMessage, "restore");

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

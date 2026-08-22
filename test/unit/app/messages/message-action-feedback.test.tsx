// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn()
}));

vi.mock("sonner", () => ({ toast: mocks }));

import { MessageDetail } from "@/features/messages/message-detail";
import type { MessageDetail as MessageDetailType } from "@/features/messages/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const message: MessageDetailType = {
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

beforeEach(() => vi.clearAllMocks());

describe("conversation action feedback", () => {
  it("shows success only after the action resolves", async () => {
    let resolveAction: (() => void) | undefined;
    const action = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });
    const view = await renderComponent(
      <MessageDetail
        defaultFromMailboxId="mbx_1"
        mailboxes={[]}
        messages={[message]}
        selectedId={message.id}
        onAction={() => action}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
      />
    );

    await flushHookEffects(() =>
      view.container
        .querySelector<HTMLButtonElement>('[aria-label="Archive conversation"]')
        ?.click()
    );
    expect(mocks.success).not.toHaveBeenCalled();

    await flushHookEffects(() => resolveAction?.());
    expect(mocks.success).toHaveBeenCalledWith("Conversation archived.");
    expect(mocks.error).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("reports an action failure without a success message", async () => {
    const view = await renderComponent(
      <MessageDetail
        defaultFromMailboxId="mbx_1"
        mailboxes={[]}
        messages={[message]}
        selectedId={message.id}
        onAction={() => Promise.reject(new Error("offline"))}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
      />
    );

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Trash conversation"]')?.click()
    );
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("The conversation could not be updated. Try again.");
    await view.unmount();
  });
});

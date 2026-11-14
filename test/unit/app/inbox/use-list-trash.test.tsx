// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useListTrash } from "@/features/inbox/use-list-trash";
import type { ConversationSummary } from "@/features/messages/types";
import type { MailFolderId } from "@/lib/routes";
import { flushHookEffects, renderHook } from "../render-hook";

const mocks = vi.hoisted(() => ({
  runConversationAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn()
}));

vi.mock("@/features/messages/api", () => ({
  runConversationAction: mocks.runConversationAction
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}));

function conversation(index: number, mailboxId = "mailbox-1"): ConversationSummary {
  return {
    createdAt: "2026-07-30T12:00:00.000Z",
    direction: "inbound",
    folder: "inbox",
    fromAddress: `customer-${index}@example.com`,
    hasAttachments: false,
    id: `message-${index}`,
    isStarred: false,
    mailboxId,
    messageCount: 1,
    readAt: null,
    receivedAt: "2026-07-30T12:00:00.000Z",
    sentAt: null,
    snippet: "Please help",
    starredAt: null,
    subject: `Subject ${index}`,
    threadId: `thread-${index}`,
    to: ["support@example.com"],
    unreadCount: 1
  };
}

const conversations = [conversation(1), conversation(2), conversation(3, "mailbox-read-only")];

async function renderListTrash(activeFolder: MailFolderId = "inbox") {
  const onConversationAction = vi.fn();
  const onRefresh = vi.fn();
  const hook = await renderHook(
    (folder: MailFolderId) =>
      useListTrash({
        activeFolder: folder,
        canOrganizeConversation: (mailboxId) => mailboxId === "mailbox-1",
        conversations,
        onConversationAction,
        onRefresh
      }),
    activeFolder
  );
  return { hook, onConversationAction, onRefresh };
}

describe("conversation list Trash", () => {
  beforeEach(() => {
    mocks.runConversationAction.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.runConversationAction.mockImplementation(async (id: string) => ({
      affected: 1,
      threadId: id.replace("message", "thread")
    }));
  });

  it("selects only conversations the person can organize", async () => {
    const { hook } = await renderListTrash();
    expect(hook.result.enabled).toBe(true);
    expect(hook.result.selectableCount).toBe(2);

    await flushHookEffects(() => hook.result.selectAll(true));
    expect([...hook.result.selectedThreadIds]).toEqual(["thread-1", "thread-2"]);
    expect(hook.result.selectedCount).toBe(2);

    await flushHookEffects(() =>
      hook.result.setSelected(conversations[0] as ConversationSummary, false)
    );
    expect([...hook.result.selectedThreadIds]).toEqual(["thread-2"]);

    await flushHookEffects(() => hook.result.clearSelection());
    expect(hook.result.selectedCount).toBe(0);
    await hook.unmount();
  });

  it("moves one conversation to Trash and refreshes the list", async () => {
    const { hook, onConversationAction, onRefresh } = await renderListTrash();

    await flushHookEffects(() =>
      hook.result.trashConversation(conversations[1] as ConversationSummary)
    );

    expect(mocks.runConversationAction).toHaveBeenCalledWith("message-2", "trash", "inbox");
    expect(onConversationAction).toHaveBeenCalledWith("thread-2", "trash", 1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Conversation moved to Trash.");
    expect(onRefresh).toHaveBeenCalledOnce();
    await hook.unmount();
  });

  it("moves the selection to Trash, reports failures, and clears the selection", async () => {
    const { hook, onConversationAction, onRefresh } = await renderListTrash();
    mocks.runConversationAction.mockImplementation(async (id: string) => {
      if (id === "message-2") throw new Error("offline");
      return { affected: 1, threadId: id.replace("message", "thread") };
    });
    await flushHookEffects(() => hook.result.selectAll(true));

    await flushHookEffects(() => hook.result.trashSelection());

    expect(mocks.runConversationAction).toHaveBeenCalledTimes(2);
    expect(onConversationAction).toHaveBeenCalledOnce();
    expect(onConversationAction).toHaveBeenCalledWith("thread-1", "trash", 1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Conversation moved to Trash.");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "One conversation could not be moved to Trash. Try again."
    );
    expect(hook.result.selectedCount).toBe(0);
    expect(hook.result.isTrashingSelection).toBe(false);
    expect(onRefresh).toHaveBeenCalledOnce();
    await hook.unmount();
  });

  it("reports a failed single move and does nothing with an empty selection", async () => {
    const { hook, onConversationAction } = await renderListTrash();
    mocks.runConversationAction.mockRejectedValue(new Error("offline"));

    await flushHookEffects(() => hook.result.trashSelection());
    expect(mocks.runConversationAction).not.toHaveBeenCalled();

    await flushHookEffects(() =>
      hook.result.trashConversation(conversations[0] as ConversationSummary)
    );
    expect(onConversationAction).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "The conversation could not be moved to Trash. Try again."
    );
    await hook.unmount();
  });

  it("drops the selection when the folder changes and offers nothing in Trash", async () => {
    const { hook } = await renderListTrash();
    await flushHookEffects(() => hook.result.selectAll(true));
    expect(hook.result.selectedCount).toBe(2);

    await hook.rerender("sent");
    expect(hook.result.selectedCount).toBe(0);
    await hook.rerender("inbox");
    expect(hook.result.selectedCount).toBe(0);

    await hook.rerender("trash");
    expect(hook.result.enabled).toBe(false);
    expect(hook.result.selectableCount).toBe(0);
    await hook.unmount();
  });
});

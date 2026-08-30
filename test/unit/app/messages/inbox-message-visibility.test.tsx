// @vitest-environment happy-dom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ConversationSummary,
  MessageDetail as MessageDetailType,
  MessageFolderAction
} from "@/features/messages/types";
import type { MailFolderId } from "@/lib/routes";

const mocks = vi.hoisted(() => ({
  getMessageThread: vi.fn(),
  runConversationAction: vi.fn(),
  runMessageAction: vi.fn()
}));

vi.mock("@/features/messages/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/messages/api")>()),
  getMessageThread: mocks.getMessageThread,
  runConversationAction: mocks.runConversationAction,
  runMessageAction: mocks.runMessageAction
}));

vi.mock("@/features/messages/message-detail", () => ({
  MessageDetail: ({
    messages,
    onMessageAction,
    onRefresh
  }: {
    messages: MessageDetailType[];
    onMessageAction: (
      message: MessageDetailType,
      action: MessageFolderAction
    ) => Promise<void> | void;
    onRefresh: () => Promise<void> | void;
  }) => {
    const firstMessage = messages[0];
    return (
      <div data-visible-message-ids={messages.map((message) => message.id).join(",")}>
        <button data-refresh-thread onClick={() => void onRefresh()} type="button">
          Refresh thread
        </button>
        {firstMessage ? (
          <button
            data-trash-message={firstMessage.id}
            onClick={() => void onMessageAction(firstMessage, "trash")}
            type="button"
          >
            Trash message
          </button>
        ) : null}
      </div>
    );
  }
}));

import { InboxPage } from "@/features/inbox/inbox-page";
import { flushHookEffects, renderComponent } from "../render-hook";

const firstMessage: MessageDetailType = {
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
  snippet: "Please help",
  textBody: "Please help.",
  htmlAvailable: false,
  messageId: "<first@example.com>",
  inReplyTo: null,
  references: [],
  attachments: [],
  receivedAt: "2026-08-30T14:00:00.000Z",
  sentAt: null,
  readAt: "2026-08-30T14:01:00.000Z",
  starredAt: null,
  hasAttachments: false,
  createdAt: "2026-08-30T14:00:00.000Z"
};

const sentMessage: MessageDetailType = {
  ...firstMessage,
  id: "msg_2",
  direction: "outbound",
  folder: "sent",
  fromAddress: "support@example.com",
  to: ["customer@example.com"],
  snippet: "We can help",
  textBody: "We can help.",
  messageId: "<second@example.com>",
  inReplyTo: "<first@example.com>",
  references: ["<first@example.com>"],
  receivedAt: null,
  sentAt: "2026-08-30T14:05:00.000Z",
  createdAt: "2026-08-30T14:05:00.000Z"
};

const conversation: ConversationSummary = {
  ...sentMessage,
  isStarred: false,
  messageCount: 2,
  unreadCount: 0
};

beforeEach(() => {
  mocks.getMessageThread.mockReset();
  mocks.runConversationAction.mockReset();
  mocks.runMessageAction.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("Inbox message visibility", () => {
  it("removes one trashed message but keeps the remaining conversation open", async () => {
    const onMessageRouteChange = vi.fn();
    let messages = [firstMessage, sentMessage];
    mocks.getMessageThread.mockImplementation(async () => messages);
    mocks.runMessageAction.mockImplementation(async () => {
      messages = [{ ...firstMessage, folder: "trash" }, sentMessage];
    });
    const view = await renderInbox(onMessageRouteChange);

    expect(visibleMessageIds(view.container)).toBe("msg_1,msg_2");
    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[data-trash-message="msg_1"]')?.click()
    );

    expect(mocks.runMessageAction).toHaveBeenCalledWith("msg_1", "trash");
    expect(visibleMessageIds(view.container)).toBe("msg_2");
    expect(onMessageRouteChange).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("returns to the folder when the trashed message was the last visible message", async () => {
    const onMessageRouteChange = vi.fn();
    let messages = [firstMessage];
    mocks.getMessageThread.mockImplementation(async () => messages);
    mocks.runMessageAction.mockImplementation(async () => {
      messages = [{ ...firstMessage, folder: "trash" }];
    });
    const view = await renderInbox(onMessageRouteChange, {
      ...firstMessage,
      isStarred: false,
      messageCount: 1,
      unreadCount: 0
    });

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[data-trash-message="msg_1"]')?.click()
    );

    expect(onMessageRouteChange).toHaveBeenCalledWith("inbox", null);
    await view.unmount();
  });

  it("shows only trashed messages when the reader opens from Trash", async () => {
    const trashedMessage = { ...firstMessage, folder: "trash" as const };
    mocks.getMessageThread.mockResolvedValue([trashedMessage, sentMessage]);
    const view = await renderInbox(
      vi.fn(),
      {
        ...trashedMessage,
        isStarred: false,
        messageCount: 1,
        unreadCount: 0
      },
      "trash"
    );

    expect(visibleMessageIds(view.container)).toBe("msg_1");
    await view.unmount();
  });

  it("ignores a stale refresh after another thread opens", async () => {
    const secondThreadMessage = {
      ...firstMessage,
      id: "msg_other",
      threadId: "thr_other",
      subject: "Other conversation",
      textBody: "Other conversation body"
    };
    let delayFirstThread = false;
    let resolveFirstThread: ((messages: MessageDetailType[]) => void) | undefined;
    mocks.getMessageThread.mockImplementation((messageId: string) => {
      if (messageId === secondThreadMessage.id) return Promise.resolve([secondThreadMessage]);
      if (!delayFirstThread) return Promise.resolve([firstMessage]);
      return new Promise<MessageDetailType[]>((resolve) => {
        resolveFirstThread = resolve;
      });
    });

    function Harness() {
      const [selectedId, setSelectedId] = React.useState<string | null>(firstMessage.id);
      return (
        <>
          <button
            data-select-other
            onClick={() => setSelectedId(secondThreadMessage.id)}
            type="button"
          >
            Select other
          </button>
          <InboxPage
            activeFolder="inbox"
            conversations={[
              {
                ...firstMessage,
                isStarred: false,
                messageCount: 1,
                unreadCount: 0
              }
            ]}
            defaultFromMailboxId="mbx_1"
            hasMore={false}
            isLoadingMore={false}
            loadMoreError={null}
            mailboxes={[]}
            selectedId={selectedId}
            totalCount={1}
            onConversationAction={() => undefined}
            onLoadMore={() => undefined}
            onMessageRouteChange={(_folder, messageId) => setSelectedId(messageId)}
            onRefresh={() => undefined}
            onSelect={() => undefined}
          />
        </>
      );
    }

    const view = await renderComponent(<Harness />);
    await flushHookEffects();
    delayFirstThread = true;
    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>("[data-refresh-thread]")?.click()
    );
    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>("[data-select-other]")?.click()
    );
    expect(visibleMessageIds(view.container)).toBe(secondThreadMessage.id);

    await flushHookEffects(() => resolveFirstThread?.([firstMessage]));
    expect(visibleMessageIds(view.container)).toBe(secondThreadMessage.id);
    await view.unmount();
  });
});

async function renderInbox(
  onMessageRouteChange: (folder: MailFolderId, messageId: string | null) => void,
  selectedConversation: ConversationSummary = conversation,
  activeFolder: "inbox" | "trash" = "inbox"
) {
  function Harness() {
    const [selectedId, setSelectedId] = React.useState<string | null>(selectedConversation.id);
    return (
      <InboxPage
        activeFolder={activeFolder}
        conversations={[selectedConversation]}
        defaultFromMailboxId="mbx_1"
        hasMore={false}
        isLoadingMore={false}
        loadMoreError={null}
        mailboxes={[]}
        selectedId={selectedId}
        totalCount={1}
        onConversationAction={() => undefined}
        onLoadMore={() => undefined}
        onMessageRouteChange={(folder, messageId) => {
          onMessageRouteChange(folder, messageId);
          setSelectedId(messageId);
        }}
        onRefresh={() => undefined}
        onSelect={() => undefined}
      />
    );
  }
  const view = await renderComponent(<Harness />);
  await flushHookEffects();
  return view;
}

function visibleMessageIds(container: HTMLElement): string | null {
  return (
    container.querySelector<HTMLElement>("[data-visible-message-ids]")?.dataset.visibleMessageIds ??
    null
  );
}

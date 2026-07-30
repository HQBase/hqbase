import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InboxPage } from "@/features/inbox/inbox-page";
import { ConversationMessages } from "@/features/messages/conversation-messages";
import { MessageDetail } from "@/features/messages/message-detail";
import { MessageListItem } from "@/features/messages/message-list-item";
import type {
  ConversationSummary,
  MessageDetail as MessageDetailType
} from "@/features/messages/types";

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

const secondMessage: MessageDetailType = {
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

const conversation: ConversationSummary = {
  ...secondMessage,
  hasAttachments: false,
  isStarred: false,
  messageCount: 2,
  unreadCount: 1
};

describe("conversation reader", () => {
  it("renders Reply and Forward for every message and keeps the large final actions", () => {
    const html = renderToStaticMarkup(
      <MessageDetail
        defaultFromMailboxId="mbx_1"
        mailboxes={[]}
        messages={[firstMessage, secondMessage]}
        selectedId={secondMessage.id}
        onAction={() => undefined}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
      />
    );

    expect(html.indexOf("I cannot sign in.")).toBeLessThan(html.indexOf("We can help."));
    expect(html.indexOf("We can help.")).toBeLessThan(html.lastIndexOf(">Reply<"));
    expect(html.match(/>Reply</g)).toHaveLength(3);
    expect(html.match(/>Forward</g)).toHaveLength(3);
    expect(html).toContain('data-compose-message-id="msg_1"');
    expect(html).toContain('data-compose-message-id="msg_2"');
    expect(html).toContain('aria-label="Back to messages"');
    expect(html).toContain('aria-label="Archive conversation"');
  });

  it("uses list-only and conversation-only compact states", () => {
    const listHtml = renderToStaticMarkup(
      <InboxPage
        activeFolder="inbox"
        conversations={[conversation]}
        defaultFromMailboxId="mbx_1"
        hasMore={false}
        isLoadingMore={false}
        loadMoreError={null}
        mailboxes={[]}
        selectedId={null}
        onConversationAction={() => undefined}
        onLoadMore={() => undefined}
        onMessageRouteChange={() => undefined}
        onRefresh={() => undefined}
        onSelect={() => undefined}
        totalCount={1}
      />
    );
    const conversationHtml = renderToStaticMarkup(
      <InboxPage
        activeFolder="inbox"
        conversations={[conversation]}
        defaultFromMailboxId="mbx_1"
        hasMore={false}
        isLoadingMore={false}
        loadMoreError={null}
        mailboxes={[]}
        selectedId={conversation.id}
        onConversationAction={() => undefined}
        onLoadMore={() => undefined}
        onMessageRouteChange={() => undefined}
        onRefresh={() => undefined}
        onSelect={() => undefined}
        totalCount={1}
      />
    );

    expect(listHtml).toContain('data-mobile-view="message-list"');
    expect(listHtml).toContain('data-mobile-view="conversation"');
    expect(listHtml).toContain("h-full min-h-0 bg-background hidden");
    expect(conversationHtml).toContain("h-full min-h-0 flex-col bg-card/35 hidden");
    expect(conversationHtml).toContain("h-full min-h-0 bg-background block");
    expect(listHtml).toContain("Pull to refresh");
  });

  it("shows the exact right-aligned conversation total and a manual paging fallback", () => {
    const html = renderToStaticMarkup(
      <InboxPage
        activeFolder="inbox"
        conversations={[conversation]}
        defaultFromMailboxId="mbx_1"
        hasMore={true}
        isLoadingMore={false}
        loadMoreError={null}
        mailboxes={[]}
        selectedId={null}
        onConversationAction={() => undefined}
        onLoadMore={() => undefined}
        onMessageRouteChange={() => undefined}
        onRefresh={() => undefined}
        onSelect={() => undefined}
        totalCount={237}
      />
    );

    expect(html).toContain('class="ml-auto font-mono text-[11px] text-muted-foreground"');
    expect(html).toContain(">237 conversations<");
    expect(html).not.toContain(">1+<");
    expect(html).toContain("Load more conversations");
  });

  it("labels the unread indicator and removes it once the message is read", () => {
    const unreadHtml = renderToStaticMarkup(
      <MessageListItem
        activeFolder="inbox"
        conversation={conversation}
        href="/inbox/msg_1"
        isActive={false}
        onSelect={() => undefined}
      />
    );
    const readHtml = renderToStaticMarkup(
      <MessageListItem
        activeFolder="inbox"
        conversation={{ ...conversation, unreadCount: 0 }}
        href="/inbox/msg_1"
        isActive={false}
        onSelect={() => undefined}
      />
    );

    expect(unreadHtml).toContain('aria-label="Unread"');
    expect(unreadHtml).toContain('title="2 messages"');
    expect(unreadHtml).toContain("2 messages</span>");
    expect(readHtml).not.toContain('aria-label="Unread"');
  });

  it("collapses messages between the first and final message behind a counted divider", () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({
      ...firstMessage,
      id: `msg_${index + 1}`,
      fromAddress: `sender-${index + 1}@example.com`,
      textBody: `Message body ${index + 1}`
    }));
    const html = renderToStaticMarkup(<ConversationMessages messages={messages} />);

    expect(html).toContain("Message body 1");
    expect(html).not.toContain("Message body 2");
    expect(html).not.toContain("Message body 3");
    expect(html).not.toContain("Message body 4");
    expect(html).not.toContain("Message body 5");
    expect(html).toContain("Message body 6");
    expect(html).toContain('aria-label="Expand 4 earlier messages"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-thread-disclosure-state="collapsed"');
    expect(html).toContain('data-thread-arrow="top-outward"');
    expect(html).toContain('data-thread-arrow="bottom-outward"');
  });
});

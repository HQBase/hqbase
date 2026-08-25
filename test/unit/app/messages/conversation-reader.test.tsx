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
  fromName: "Customer Example",
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
  fromName: "Support",
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
  it("renders Reply and Forward under the last message", () => {
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
    expect(html.match(/>Reply</g)).toHaveLength(1);
    expect(html.match(/>Forward</g)).toHaveLength(1);
    expect(html).toContain('data-compose-message-id="msg_1"');
    expect(html).toContain('data-compose-message-id="msg_2"');
    expect(html).toContain('aria-label="Back to messages"');
    expect(html).toContain('aria-label="Archive conversation"');
    expect(html).toContain("Customer Example");
    expect(html).toContain("customer@example.com · to support@example.com");
  });

  it("offers restore instead of archive and trash in Trash", () => {
    const html = renderToStaticMarkup(
      <MessageDetail
        activeFolder="trash"
        defaultFromMailboxId="mbx_1"
        mailboxes={[]}
        messages={[{ ...firstMessage, folder: "trash" }]}
        selectedId={firstMessage.id}
        onAction={() => undefined}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Restore conversation"');
    expect(html).not.toContain('aria-label="Archive conversation"');
    expect(html).not.toContain('aria-label="Trash conversation"');
  });

  it("offers unarchive and trash in Archived", () => {
    const html = renderToStaticMarkup(
      <MessageDetail
        activeFolder="archived"
        defaultFromMailboxId="mbx_1"
        mailboxes={[]}
        messages={[{ ...firstMessage, folder: "archived" }]}
        selectedId={firstMessage.id}
        onAction={() => undefined}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Unarchive conversation"');
    expect(html).toContain('aria-label="Trash conversation"');
    expect(html).not.toContain('aria-label="Archive conversation"');
    expect(html).not.toContain('aria-label="Restore conversation"');
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
    expect(conversationHtml).not.toContain('data-mobile-view="message-list"');
    expect(conversationHtml).toContain("bg-reader");
    expect(conversationHtml).toContain('aria-label="Back to messages"');
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

    expect(html).toContain("237 conversations");
    expect(html).not.toContain(">1+<");
    expect(html).toContain("Load more conversations");
    expect(html.match(/max-w-\[960px\]/gu)).toHaveLength(2);
    expect(html).not.toContain("max-w-[1200px]");
  });

  it("labels the unread indicator and removes it once the message is read", () => {
    const unreadHtml = renderToStaticMarkup(
      <MessageListItem
        activeFolder="inbox"
        conversation={conversation}
        href="/mail/inbox/msg_1"
        isActive={false}
        onSelect={() => undefined}
        onToggleStar={() => undefined}
      />
    );
    const readHtml = renderToStaticMarkup(
      <MessageListItem
        activeFolder="inbox"
        conversation={{ ...conversation, unreadCount: 0 }}
        href="/mail/inbox/msg_1"
        isActive={false}
        onSelect={() => undefined}
        onToggleStar={() => undefined}
      />
    );

    expect(unreadHtml).toContain('aria-label="Star conversation"');
    expect(unreadHtml).toContain('title="2 messages"');
    expect(unreadHtml).toContain(">2<");
    expect(readHtml).toContain('aria-label="Star conversation"');
  });

  it("uses a Gmail-style information stack only below the small breakpoint", () => {
    const customerLabel = {
      color: "blue" as const,
      createdAt: "2026-07-27T14:00:00.000Z",
      id: "label-customer",
      name: "Customer",
      updatedAt: "2026-07-27T14:00:00.000Z"
    };
    const html = renderToStaticMarkup(
      <MessageListItem
        activeFolder="inbox"
        conversation={{
          ...conversation,
          direction: "inbound",
          fromAddress: "support@example.com",
          fromName: "Support Team",
          labels: [customerLabel]
        }}
        href="/mail/inbox/msg_1"
        isActive={false}
        labels={[customerLabel]}
        onSelect={() => undefined}
        onToggleLabel={() => undefined}
        onToggleStar={() => undefined}
      />
    );

    expect(html).toContain('data-message-avatar="mobile"');
    expect(html).toContain("grid-cols-[2.5rem_minmax(0,1fr)_5rem]");
    expect(html).toContain("rounded-xl px-3");
    expect(html).toContain("sm:grid-cols-[2rem_minmax(7rem,18%)_minmax(0,1fr)_auto_4.5rem]");
    expect(html).toContain("sm:items-center");
    expect(html).not.toContain("row-start-3");
    expect(html).toContain("sm:col-start-4");
    expect(html).toContain("sm:col-start-5");
    expect(html).not.toContain("sm:col-start-6");
    expect(html).not.toContain("sm:row-start-2 sm:mt-1");
    expect(html).toContain("bg-blue-500/15");
    expect(html).toContain("text-[9px]");
    expect(html).toContain('aria-label="Labels"');
    expect(html).toContain("min-h-10");
    expect(html).toContain("size-6 min-h-6 min-w-6");
    expect(html).toContain("sm:min-h-5");
    expect(html).toContain("group/label-pill col-start-2 row-start-2");
    expect(html).toContain("w-fit min-w-0 max-w-[75%]");
    expect(html).toContain("self-center justify-self-end rounded-full bg-transparent p-0.5");
    expect(html).toContain("sm:col-start-3 sm:row-start-1");
    expect(html).toContain("gap-0.5 sm:col-start-4 sm:row-start-1 sm:flex sm:w-7 sm:min-w-7");
    expect(html).toContain("bg-muted px-0.5 py-0.5 text-[11px]");
    expect(html).toContain("overflow-hidden sm:hidden");
    expect(html).toContain("shadow-[0_0_6px_1px_hsl(var(--background)/0.14)]");
    expect(html).toContain("backdrop-blur-[2px]");
    expect(html).toContain("hover:bg-transparent");
    expect(html).not.toContain("bg-background/60");
    expect(html).not.toContain("group/label-pill absolute");
    expect(html.match(/>Customer<\/span>/gu)).toHaveLength(2);
    expect(html).toContain('data-label-menu-icon="tag"');
    expect(html.indexOf("Support Team")).toBeLessThan(html.indexOf("Account access"));
    expect(html.indexOf("Account access")).toBeLessThan(html.indexOf("We can help"));
    expect(html.indexOf("We can help")).toBeLessThan(html.indexOf("Customer"));
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

  it("keeps inline images out of the downloadable attachment list", () => {
    const html = renderToStaticMarkup(
      <ConversationMessages
        messages={[
          {
            ...firstMessage,
            attachments: [
              {
                id: "inline-logo",
                filename: "logo.png",
                contentType: "image/png",
                sizeBytes: 4,
                contentId: "logo@example.com"
              },
              {
                id: "report",
                filename: "report.pdf",
                contentType: "application/pdf",
                sizeBytes: 8,
                contentId: null
              }
            ]
          }
        ]}
      />
    );

    expect(html).not.toContain("logo.png");
    expect(html).toContain("report.pdf");
  });
});

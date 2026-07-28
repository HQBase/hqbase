import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InboxPage } from "@/features/inbox/inbox-page";
import { ConversationMessages } from "@/features/messages/conversation-messages";
import { MessageDetail } from "@/features/messages/message-detail";
import { MessageListItem } from "@/features/messages/message-list-item";
import type { MessageDetail as MessageDetailType, MessageSummary } from "@/features/messages/types";

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

describe("conversation reader", () => {
  it("renders the complete thread and keeps Reply and Forward at the bottom", () => {
    const html = renderToStaticMarkup(
      <MessageDetail
        mailboxes={[]}
        messages={[firstMessage, secondMessage]}
        selectedId={secondMessage.id}
        onAction={() => undefined}
        onBack={() => undefined}
        onSent={() => undefined}
      />
    );

    expect(html.indexOf("I cannot sign in.")).toBeLessThan(html.indexOf("We can help."));
    expect(html.indexOf("We can help.")).toBeLessThan(html.lastIndexOf(">Reply<"));
    expect(html).toContain(">Forward<");
    expect(html).toContain('aria-label="Back to messages"');
    expect(html).not.toContain('aria-label="Reply"');
    expect(html).toContain('aria-label="Archive"');
  });

  it("uses list-only and conversation-only compact states", () => {
    const summary: MessageSummary = firstMessage;
    const listHtml = renderToStaticMarkup(
      <InboxPage
        activeFolder="inbox"
        mailboxes={[]}
        messages={[summary]}
        selectedId={null}
        onMessageRouteChange={() => undefined}
        onRefresh={() => undefined}
        onSelect={() => undefined}
      />
    );
    const conversationHtml = renderToStaticMarkup(
      <InboxPage
        activeFolder="inbox"
        mailboxes={[]}
        messages={[summary]}
        selectedId={summary.id}
        onMessageRouteChange={() => undefined}
        onRefresh={() => undefined}
        onSelect={() => undefined}
      />
    );

    expect(listHtml).toContain('data-mobile-view="message-list"');
    expect(listHtml).toContain('data-mobile-view="conversation"');
    expect(listHtml).toContain("lg:block hidden");
    expect(conversationHtml).toContain("lg:flex lg:border-r hidden");
    expect(conversationHtml).toContain("lg:block block");
  });

  it("labels the unread indicator and removes it once the message is read", () => {
    const unreadHtml = renderToStaticMarkup(
      <MessageListItem
        href="/inbox/msg_1"
        isActive={false}
        message={firstMessage}
        onSelect={() => undefined}
      />
    );
    const readHtml = renderToStaticMarkup(
      <MessageListItem
        href="/inbox/msg_1"
        isActive={false}
        message={{ ...firstMessage, readAt: "2026-07-27T14:05:00.000Z" }}
        onSelect={() => undefined}
      />
    );

    expect(unreadHtml).toContain('aria-label="Unread"');
    expect(readHtml).not.toContain('aria-label="Unread"');
  });

  it("collapses messages between the first and final two behind a counted divider", () => {
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
    expect(html).toContain("Message body 5");
    expect(html).toContain("Message body 6");
    expect(html).toContain("3 earlier messages");
    expect(html).toContain('aria-expanded="false"');
  });
});

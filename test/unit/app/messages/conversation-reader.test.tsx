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
    expect(html).not.toContain('data-compose-message-id="msg_1"');
    expect(html.match(/data-compose-message-id="msg_2"/g)).toHaveLength(2);
    expectReaderBackLayout(html);
    expect(html).toContain('aria-label="Archive conversation"');
    expect(html).toContain("Customer Example");
    expect(html).toContain("customer@example.com · to support@example.com");
    const title = html.match(/<h1[^>]*>/u)?.[0];
    expect(title).toContain("truncate whitespace-nowrap");
    expect(title).not.toContain("break-words");
    expect(title).not.toContain("text-balance");
    const mobileActions = html.match(/<div class="absolute inset-y-0 right-0[^>]*>/u)?.[0];
    expect(mobileActions).toContain("bg-toolbar");
    expect(mobileActions).toContain("shadow-[-10px_0_8px_2px_hsl(var(--surface-toolbar))]");
    expect(mobileActions).toContain("sm:static");
    expect(mobileActions).toContain("sm:shadow-none");
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
    expectReaderBackLayout(conversationHtml);
    expect(conversationHtml).toContain("Loading conversation…");
    expect(listHtml).toContain("Pull to refresh");
  });

  it("shows the exact right-aligned conversation total and a manual paging fallback", () => {
    const label = {
      color: "blue" as const,
      createdAt: "2026-07-27T14:00:00.000Z",
      id: "label-1",
      name: "Customer",
      updatedAt: "2026-07-27T14:00:00.000Z"
    };
    const html = renderToStaticMarkup(
      <InboxPage
        activeFolder="inbox"
        conversations={[conversation]}
        defaultFromMailboxId="mbx_1"
        hasMore={true}
        isLoadingMore={false}
        labels={[label]}
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
    const header = html.match(/<div[^>]*data-mail-list-header-layout[^>]*>/u)?.[0];
    expect(header).toContain(
      "sm:grid-cols-[2rem_minmax(7rem,18%)_1rem_minmax(0,1fr)_1.75rem_4rem]"
    );
    expect(html).toContain(
      "col-start-2 flex min-w-0 items-center justify-end sm:col-start-4 sm:row-start-1"
    );
  });

  it("labels the unread indicator and removes it once the message is read", () => {
    const unreadHtml = renderToStaticMarkup(
      <MessageListItem
        conversation={conversation}
        href="/mail/inbox/msg_1"
        isActive={false}
        onSelect={() => undefined}
        onToggleStar={() => undefined}
      />
    );
    const readHtml = renderToStaticMarkup(
      <MessageListItem
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
    expect(unreadHtml).toContain(">(2)</span>");
    expect(unreadHtml).not.toContain("bg-muted px-1.5 py-0.5");
    expect(readHtml).toContain('aria-label="Star conversation"');
  });

  it("uses a Gmail-style information stack only below the small breakpoint", () => {
    const hrLabel = {
      color: "blue" as const,
      createdAt: "2026-07-27T14:00:00.000Z",
      id: "label-hr",
      name: "HR",
      updatedAt: "2026-07-27T14:00:00.000Z"
    };
    const importantLabel = {
      ...hrLabel,
      color: "red" as const,
      id: "label-important",
      name: "Important"
    };
    const html = renderToStaticMarkup(
      <MessageListItem
        conversation={{
          ...conversation,
          direction: "inbound",
          fromAddress: "support@example.com",
          fromName: "Support Team",
          hasAttachments: true,
          labels: [hrLabel, importantLabel]
        }}
        href="/mail/inbox/msg_1"
        isActive={false}
        canOrganizeLabels
        labels={[hrLabel, importantLabel]}
        onSelect={() => undefined}
        onToggleLabel={() => undefined}
        onToggleStar={() => undefined}
      />
    );

    expect(html).toContain('data-message-avatar="mobile"');
    expect(html).toContain("grid-cols-[2.5rem_minmax(0,1fr)_4rem]");
    expect(html).not.toContain("grid-cols-[2.5rem_minmax(0,1fr)_5rem]");
    expect(html).toContain("rounded-xl px-3");
    expect(html).toContain("sm:grid-cols-[2rem_minmax(7rem,18%)_1rem_minmax(0,1fr)_1.75rem_4rem]");
    expect(html).not.toContain("sm:grid-cols-[2rem_minmax(7rem,18%)_minmax(0,1fr)_auto_4rem]");
    expect(html).toContain("sm:items-center");
    expect(html).not.toContain("row-start-3");
    expect(html).toContain(
      "hidden items-center justify-center sm:col-start-3 sm:row-start-1 sm:flex"
    );
    expect(html).toContain('aria-label="Has attachments"');
    expect(html).toContain("sm:col-start-4");
    expect(html).toContain("sm:col-start-5");
    expect(html).toContain("sm:col-start-6");
    expect(html).toContain("sm:mr-2 sm:overflow-hidden");
    expect(html).not.toContain("sm:pr-2");
    expect(html).not.toContain("sm:row-start-2 sm:mt-1");
    const time = html.match(/<time[^>]*>/u)?.[0];
    expect(time).toContain("whitespace-nowrap");
    expect(html).toContain("bg-blue-500/15");
    expect(html).toContain("text-blue-700");
    expect(html).toContain("text-[9px]");
    expect(html).toContain('aria-label="Labels: HR, Important"');
    expect(html).toContain("min-h-10");
    expect(html).toContain("min-h-0");
    expect(html).toContain("col-start-2 row-start-2");
    expect(html).toContain("self-end justify-self-end");
    expect(html).toContain("sm:col-start-4 sm:row-start-1 sm:inline-flex");
    expect(html).toContain("sm:col-start-5 sm:row-start-1 sm:flex sm:w-7 sm:min-w-7");
    expect(html).toContain("bg-muted px-0.5 py-0.5 text-[11px]");
    expect(html).toContain(">(2)</span>");
    expect(html).toContain('class="shrink-0 tabular-nums sm:hidden"');
    expect(html).not.toContain(
      'class="shrink-0 text-[11px] font-normal tabular-nums text-tertiary sm:hidden"'
    );
    expect(html).not.toContain("bg-muted px-1.5 py-0.5");
    const starSlot = html.match(/<span class="col-start-3 row-start-2[^>]*>[\s\S]*?<\/span>/u)?.[0];
    expect(starSlot).toContain("self-end");
    expect(starSlot).toContain("sm:self-center");
    expect(starSlot).toContain("items-end");
    expect(starSlot).toContain("pb-px");
    expect(starSlot).toContain("sm:items-center");
    expect(starSlot).toContain("sm:pb-0");
    expect(starSlot).toContain("size-[18px] -translate-y-px sm:size-4 sm:translate-y-0");
    expect(starSlot).not.toContain("hover:bg-accent");
    const row = html.match(/<a[^>]*>/u)?.[0];
    expect(row).toContain("[--message-row-surface:var(--surface-list)]");
    expect(row).toContain("hover:[--message-row-surface:var(--surface-hover)]");
    const attachmentMarkers = [...html.matchAll(/aria-label="Has attachments"/gu)];
    expect(attachmentMarkers).toHaveLength(2);
    expect(attachmentMarkers[1]?.index).toBeLessThan(html.indexOf(">Account access"));
    const compactLabelContainer = html.match(/<span[^>]*data-message-labels="compact"[^>]*>/u)?.[0];
    expect(compactLabelContainer).toContain("w-max");
    expect(compactLabelContainer).toContain("overflow-visible");
    expect(compactLabelContainer).not.toContain("max-w-[75%]");
    expect(compactLabelContainer).not.toContain("overflow-hidden");
    expect(compactLabelContainer).toContain("rounded-full");
    expect(compactLabelContainer).toContain("bg-[hsl(var(--message-row-surface))]");
    expect(compactLabelContainer).toContain("p-0.5");
    expect(compactLabelContainer).toContain(
      "shadow-[-5px_0_5px_1px_hsl(var(--message-row-surface))]"
    );
    expect(compactLabelContainer).not.toContain("backdrop-blur");
    expect(html).toContain("w-max shrink-0 leading-4");
    const labelButton = html.match(
      /<button[^>]*data-message-labels="desktop"[^>]*>[\s\S]*?<\/button>/u
    )?.[0];
    expect(labelButton).toContain("rounded-full");
    expect(labelButton).toContain("bg-[hsl(var(--message-row-surface))]");
    expect(labelButton).toContain("p-0.5");
    expect(labelButton).toContain("shadow-[-5px_0_5px_1px_hsl(var(--message-row-surface))]");
    expect(labelButton).toContain("sm:shadow-[-8px_0_8px_2px_hsl(var(--message-row-surface))]");
    expect(labelButton).toContain("hover:bg-[hsl(var(--message-row-surface))]");
    expect(labelButton).not.toContain("backdrop-blur");
    expect(labelButton).toContain("sm:inline-flex");
    expect(labelButton).toContain(">HR</span>");
    expect(labelButton).toContain(">Important</span>");
    expect(html.match(/>HR<\/span>/gu)).toHaveLength(2);
    expect(html.match(/>Important<\/span>/gu)).toHaveLength(2);
    expect(html).toContain("min-w-10");
    expect(html).toContain("max-w-20");
    expect(html).toContain('data-label-menu-icon="tag"');
    expect(html.indexOf("Support Team")).toBeLessThan(html.indexOf(">(2)</span>"));
    expect(html.indexOf(">(2)</span>")).toBeLessThan(html.indexOf("Account access"));
    expect(html.indexOf("Account access")).toBeLessThan(html.indexOf("We can help"));
    expect(html.indexOf("We can help")).toBeLessThan(html.indexOf("Important"));

    const readOnlyHtml = renderToStaticMarkup(
      <MessageListItem
        conversation={{ ...conversation, labels: [hrLabel] }}
        href="/mail/inbox/msg_1"
        isActive={false}
        labels={[hrLabel]}
        onSelect={() => undefined}
        onToggleLabel={() => undefined}
        onToggleStar={() => undefined}
      />
    );
    expect(readOnlyHtml).not.toContain('<button aria-label="Labels: HR"');
    expect(readOnlyHtml).toContain('<span class="z-10 hidden');
    expect(readOnlyHtml).toContain('data-message-labels="desktop"');

    const activeHtml = renderToStaticMarkup(
      <MessageListItem
        conversation={conversation}
        href="/mail/inbox/msg_1"
        isActive
        onSelect={() => undefined}
        onToggleStar={() => undefined}
      />
    );
    expect(activeHtml.match(/<a[^>]*>/u)?.[0]).toContain(
      "[--message-row-surface:var(--surface-selected)]"
    );
  });

  it("keeps every compact label visible in a right-aligned row", () => {
    const names = ["Customer", "Priority", "Billing", "Follow up", "Partner", "HR", "Important"];
    const labels = names.map((name, index) => ({
      color: "blue" as const,
      createdAt: "2026-08-25T12:00:00.000Z",
      id: `label-${index + 1}`,
      name,
      updatedAt: "2026-08-25T12:00:00.000Z"
    }));
    const html = renderToStaticMarkup(
      <MessageListItem
        conversation={{ ...conversation, labels }}
        href="/mail/inbox/msg_1"
        isActive={false}
        onSelect={() => undefined}
        onToggleStar={() => undefined}
      />
    );
    const compactLabels = html.match(
      /<span[^>]*data-message-labels="compact"[^>]*>[\s\S]*?(?=<span class="z-10 hidden)/u
    )?.[0];

    expect(compactLabels).toContain("w-max");
    expect(compactLabels).toContain("shrink-0");
    expect(compactLabels).toContain("justify-self-end");
    expect(compactLabels).toContain("overflow-visible");
    expect(compactLabels).not.toContain("max-w-[75%]");
    expect(compactLabels).not.toContain("overflow-hidden");
    expect(compactLabels).not.toContain("data-label-stack-color");
    for (const name of names) expect(compactLabels).toContain(`>${name}</span>`);
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
    expect(html).toContain("grid size-8");
    expect(html).toContain("rounded-full bg-muted");
    expect(html).toContain("size-2.5");
    expect(html).not.toContain('<div class="divide-y divide-border"><article');
    expect(html.match(/data-orientation="horizontal"/gu)).toHaveLength(2);
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
                contentId: "logo@example.com",
                disposition: "inline"
              },
              {
                id: "report",
                filename: "report.pdf",
                contentType: "application/pdf",
                sizeBytes: 8,
                contentId: "gmail-report@example.com",
                disposition: "attachment"
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

function expectReaderBackLayout(html: string): void {
  expect(html).toContain('class="shrink-0 border-b border-divider bg-toolbar px-3 sm:px-5"');
  expect(html).toContain('class="relative flex h-11 items-center gap-2 py-2"');
  const button = html.match(/<button[^>]*aria-label="Back to messages"[^>]*>/u)?.[0];
  expect(button).toContain("size-10 min-h-10 min-w-10 shrink-0 bg-transparent text-tertiary");
  const icon = html.match(/<svg[^>]*class="[^"]*pointer-events-none size-3\.5[^"]*"/u)?.[0];
  expect(icon).toBeDefined();
}

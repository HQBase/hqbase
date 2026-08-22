import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { listConversationPage } from "../../../worker/features/messages/conversation-queries";
import { listMessagePage } from "../../../worker/features/messages/queries";
import { applyCurrentMigrations } from "./current-migrations";

const mailboxId = "mbx_search";
const scope = { includeUnassigned: false, mailboxIds: [mailboxId] };

describe("message search", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    const stamp = "2026-08-22T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES (?, 'search@example.com', 'Search', 1, ?, ?)`
      ).bind(mailboxId, stamp, stamp),
      ...searchMessageRows("percent", "Save 100% today", stamp),
      ...searchMessageRows("percent_noise", "Save 100 dollars today", stamp),
      ...searchMessageRows("underscore", "Project a_b", stamp),
      ...searchMessageRows("underscore_noise", "Project axb", stamp),
      ...searchMessageRows("backslash", String.raw`Path C:\mail`, stamp),
      ...searchMessageRows("backslash_noise", "Path C:/mail", stamp)
    ]);
  });

  it.each([
    ["100%", "msg_search_percent"],
    ["a_b", "msg_search_underscore"],
    [String.raw`C:\mail`, "msg_search_backslash"]
  ])("treats metacharacters as literal text in both search paths", async (search, expectedId) => {
    const messagePage = await listMessagePage(env.DB, { scope, search });
    const conversationPage = await listConversationPage(env.DB, { scope, search });

    expect(messagePage.messages.map((message) => message.id)).toEqual([expectedId]);
    expect(conversationPage.conversations.map((conversation) => conversation.id)).toEqual([
      expectedId
    ]);
  });
});

function searchMessageRows(id: string, subject: string, stamp: string): D1PreparedStatement[] {
  const threadId = `thr_search_${id}`;
  const messageId = `msg_search_${id}`;
  return [
    env.DB.prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(threadId, subject, stamp, stamp, stamp),
    env.DB.prepare(
      `INSERT INTO messages (
         id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
         subject, snippet, text_body, references_json, received_at, has_attachments,
         created_at, updated_at
       ) VALUES (
         ?, ?, ?, 'inbound', 'inbox', 'sender@example.net', '[]', '[]', '[]',
         ?, '', '', '[]', ?, 0, ?, ?
       )`
    ).bind(messageId, threadId, mailboxId, subject, stamp, stamp, stamp)
  ];
}

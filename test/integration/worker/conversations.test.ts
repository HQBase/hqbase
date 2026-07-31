import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import workspaceMigration from "../../../migrations/0002_workspace.sql?raw";
import oauthResourcesMigration from "../../../migrations/0003_oauth_resources.sql?raw";
import conversationMigration from "../../../migrations/0004_conversations.sql?raw";
import threadRebuildMigration from "../../../migrations/0005_rebuild_threads.sql?raw";
import {
  listConversationPage,
  listConversations,
  updateConversationAction
} from "../../../worker/features/messages/conversation-queries";
import { migrationStatements } from "./migration-statements";

describe("conversation persistence", () => {
  beforeAll(async () => {
    for (const migration of [
      initialMigration,
      workspaceMigration,
      oauthResourcesMigration,
      conversationMigration
    ]) {
      await applyMigration(migration);
    }
    await env.DB.prepare(
      `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES ('mbx_conversations', 'support@example.com', 'Support', 1, ?, ?)`
    )
      .bind("2026-07-28T12:00:00.000Z", "2026-07-28T12:00:00.000Z")
      .run();
    await env.DB.prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES ('thr_subject', 'status update', ?, ?, ?)`
    )
      .bind("2026-07-28T14:00:00.000Z", "2026-07-28T12:00:00.000Z", "2026-07-28T14:00:00.000Z")
      .run();
    await insertLegacyMessage({
      id: "msg_root_a",
      direction: "inbound",
      folder: "inbox",
      from: "alice@example.com",
      messageId: "<root-a@example.com>",
      occurredAt: "2026-07-28T12:00:00.000Z"
    });
    await insertLegacyMessage({
      id: "msg_reply_a",
      direction: "outbound",
      folder: "sent",
      from: "support@example.com",
      inReplyTo: "<root-a@example.com>",
      messageId: "<reply-a@example.com>",
      occurredAt: "2026-07-28T13:00:00.000Z",
      references: ["<root-a@example.com>"]
    });
    await insertLegacyMessage({
      id: "msg_root_b",
      direction: "inbound",
      folder: "inbox",
      from: "bob@example.com",
      messageId: "<root-b@example.com>",
      occurredAt: "2026-07-28T14:00:00.000Z"
    });
    await applyMigration(threadRebuildMigration);
  });

  it("repairs subject-only history from message headers", async () => {
    const rows = await env.DB.prepare("SELECT id, thread_id FROM messages ORDER BY id").all<{
      id: string;
      thread_id: string;
    }>();
    const threadByMessage = new Map(rows.results.map((row) => [row.id, row.thread_id]));

    expect(threadByMessage.get("msg_reply_a")).toBe(threadByMessage.get("msg_root_a"));
    expect(threadByMessage.get("msg_root_b")).not.toBe(threadByMessage.get("msg_root_a"));
  });

  it("lists one latest-message row per conversation and applies scoped actions", async () => {
    const filters = { folder: "inbox" as const, mailboxIds: ["mbx_conversations"] };
    const initial = await listConversations(env.DB, filters);
    const initialPage = await listConversationPage(env.DB, { ...filters, limit: 1 });
    const alice = initial.find((conversation) => conversation.messageCount === 2);

    expect(initial).toHaveLength(2);
    expect(initialPage.totalCount).toBe(2);
    expect(alice).toMatchObject({
      direction: "outbound",
      id: "msg_reply_a",
      isStarred: false,
      unreadCount: 1
    });

    await expect(
      updateConversationAction(env.DB, {
        action: "read",
        activeFolder: "inbox",
        mailboxIds: ["mbx_conversations"],
        messageId: "msg_root_a"
      })
    ).resolves.toMatchObject({ affected: 1 });
    await expect(
      updateConversationAction(env.DB, {
        action: "star",
        activeFolder: "inbox",
        mailboxIds: ["mbx_conversations"],
        messageId: "msg_root_a"
      })
    ).resolves.toMatchObject({ affected: 2 });

    const starred = await listConversations(env.DB, {
      folder: "starred",
      mailboxIds: ["mbx_conversations"]
    });
    expect(starred).toHaveLength(1);
    expect(starred[0]).toMatchObject({ id: "msg_reply_a", isStarred: true, unreadCount: 0 });

    await expect(
      updateConversationAction(env.DB, {
        action: "archive",
        activeFolder: "inbox",
        mailboxIds: ["mbx_conversations"],
        messageId: "msg_root_a"
      })
    ).resolves.toMatchObject({ affected: 1 });
    expect(await listConversations(env.DB, filters)).toHaveLength(1);
    expect(
      await listConversations(env.DB, {
        folder: "sent",
        mailboxIds: ["mbx_conversations"]
      })
    ).toHaveLength(1);

    await expect(
      updateConversationAction(env.DB, {
        action: "trash",
        activeFolder: "sent",
        mailboxIds: ["mbx_conversations"],
        messageId: "msg_root_a"
      })
    ).resolves.toMatchObject({ affected: 1 });
  });

  it("pages conversations with a stable opaque cursor", async () => {
    const filters = {
      limit: 1,
      mailboxIds: ["mbx_conversations"]
    };
    const firstPage = await listConversationPage(env.DB, filters);

    expect(firstPage.conversations).toHaveLength(1);
    expect(firstPage.conversations[0]?.id).toBe("msg_root_b");
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.totalCount).toBe(2);

    const secondPage = await listConversationPage(env.DB, {
      ...filters,
      cursor: firstPage.nextCursor ?? undefined
    });
    expect(secondPage.conversations).toHaveLength(1);
    expect(secondPage.conversations[0]?.id).toBe("msg_reply_a");
    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.totalCount).toBeNull();
  });

  it("rejects malformed conversation cursors", async () => {
    await expect(
      listConversationPage(env.DB, {
        cursor: "not-a-cursor",
        folder: "inbox",
        mailboxIds: ["mbx_conversations"]
      })
    ).rejects.toMatchObject({
      code: "INVALID_CONVERSATION_CURSOR",
      status: 400
    });
  });
});

async function insertLegacyMessage(input: {
  direction: "inbound" | "outbound";
  folder: "inbox" | "sent";
  from: string;
  id: string;
  inReplyTo?: string;
  messageId: string;
  occurredAt: string;
  references?: string[];
}): Promise<void> {
  const inbound = input.direction === "inbound";
  await env.DB.prepare(
    `INSERT INTO messages (
      id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
      subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
      received_at, sent_at, read_at, has_attachments, created_at, updated_at
    ) VALUES (
      ?, 'thr_subject', 'mbx_conversations', ?, ?, ?, ?, '[]', '[]',
      'Status update', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?
    )`
  )
    .bind(
      input.id,
      input.direction,
      input.folder,
      input.from,
      JSON.stringify([inbound ? "support@example.com" : "alice@example.com"]),
      input.id,
      input.id,
      input.messageId,
      `${input.id}:support@example.com`,
      input.inReplyTo ?? null,
      JSON.stringify(input.references ?? []),
      inbound ? input.occurredAt : null,
      inbound ? null : input.occurredAt,
      inbound ? null : input.occurredAt,
      input.occurredAt,
      input.occurredAt
    )
    .run();
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}

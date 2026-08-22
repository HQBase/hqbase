import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import {
  listConversationPage,
  updateConversationAction
} from "../../../worker/features/messages/conversation-queries";
import { listMessages, listThreadMessages } from "../../../worker/features/messages/queries";
import { applyCurrentMigrations } from "./current-migrations";

/**
 * Unassigned catch-all mail has no mailbox grant. Its explicit marker must remain separate from a
 * null mailbox reference, which can also result from mailbox deletion.
 */
describe("catch-all visibility", () => {
  const ownerScope = { includeUnassigned: true, mailboxIds: ["mbx_support"] };
  const mailboxOnlyScope = { includeUnassigned: false, mailboxIds: ["mbx_support"] };

  beforeAll(async () => {
    await applyCurrentMigrations();
    const now = "2026-08-15T13:15:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_support', 'support@example.com', 'Support', 1, ?, ?)`
      ).bind(now, now),
      env.DB.prepare(
        `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES
           ('thr_inbox', 'inbox', ?, ?, ?),
           ('thr_catchall', 'catchall', ?, ?, ?),
           ('thr_orphan', 'orphan', ?, ?, ?)`
      ).bind(now, now, now, now, now, now, now, now, now)
    ]);
    await insertMessage({
      folder: "inbox",
      id: "msg_inbox",
      isUnassigned: false,
      mailboxId: "mbx_support",
      receivedAt: "2026-08-15T13:14:58.000Z",
      threadId: "thr_inbox",
      to: "support@example.com"
    });
    await insertMessage({
      folder: "catchall",
      id: "msg_catchall",
      isUnassigned: true,
      mailboxId: null,
      receivedAt: "2026-08-15T13:15:06.000Z",
      threadId: "thr_catchall",
      to: "hello@example.com"
    });
    await insertMessage({
      folder: "inbox",
      id: "msg_orphan",
      isUnassigned: false,
      mailboxId: null,
      receivedAt: "2026-08-15T13:15:07.000Z",
      threadId: "thr_orphan",
      to: "deleted@example.com"
    });
  });

  it("returns catch-all messages for a scope that includes them", async () => {
    const catchall = await listMessages(env.DB, { folder: "catchall", scope: ownerScope });
    expect(catchall.map((message) => message.id)).toEqual(["msg_catchall"]);
    expect(catchall[0]).toMatchObject({ folder: "catchall", mailboxId: null });

    const everything = await listMessages(env.DB, { scope: ownerScope });
    expect(everything.map((message) => message.id)).toEqual(["msg_catchall", "msg_inbox"]);
  });

  it("hides catch-all messages from a scope limited to granted mailboxes", async () => {
    await expect(
      listMessages(env.DB, { folder: "catchall", scope: mailboxOnlyScope })
    ).resolves.toEqual([]);
    const everything = await listMessages(env.DB, { scope: mailboxOnlyScope });
    expect(everything.map((message) => message.id)).toEqual(["msg_inbox"]);
  });

  it("does not treat a null mailbox reference as unassigned mail", async () => {
    const everything = await listMessages(env.DB, { scope: ownerScope });
    expect(everything.map((message) => message.id)).not.toContain("msg_orphan");
  });

  it("applies the same rule to conversations and threads", async () => {
    const included = await listConversationPage(env.DB, {
      folder: "catchall",
      scope: ownerScope
    });
    expect(included.conversations.map((conversation) => conversation.id)).toEqual(["msg_catchall"]);

    const excluded = await listConversationPage(env.DB, {
      folder: "catchall",
      scope: mailboxOnlyScope
    });
    expect(excluded.conversations).toEqual([]);
    expect(excluded.totalCount).toBe(0);

    await expect(listThreadMessages(env.DB, "thr_catchall", ownerScope)).resolves.toHaveLength(1);
    await expect(listThreadMessages(env.DB, "thr_catchall", mailboxOnlyScope)).resolves.toEqual([]);
  });

  it("keeps unassigned access after archive changes the folder", async () => {
    await expect(
      updateConversationAction(env.DB, {
        action: "archive",
        activeFolder: "catchall",
        messageId: "msg_catchall",
        scope: ownerScope
      })
    ).resolves.toMatchObject({ affected: 1 });
    const archived = await listMessages(env.DB, { folder: "archived", scope: ownerScope });
    expect(archived.map((message) => message.id)).toContain("msg_catchall");
  });
});

async function insertMessage(input: {
  folder: "catchall" | "inbox";
  id: string;
  isUnassigned: boolean;
  mailboxId: string | null;
  receivedAt: string;
  threadId: string;
  to: string;
}): Promise<void> {
  const now = "2026-08-15T13:15:00.000Z";
  await env.DB.prepare(
    `INSERT INTO messages (
       id, thread_id, mailbox_id, is_unassigned, direction, folder,
       from_address, to_json, cc_json, bcc_json,
       subject, snippet, text_body, references_json, received_at, read_at, has_attachments,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'inbound', ?, 'sender@example.com', ?, '[]', '[]',
       'Subject', 'Snippet', 'Body', '[]', ?, NULL, 0, ?, ?)`
  )
    .bind(
      input.id,
      input.threadId,
      input.mailboxId,
      input.isUnassigned ? 1 : 0,
      input.folder,
      JSON.stringify([input.to]),
      input.receivedAt,
      now,
      now
    )
    .run();
}

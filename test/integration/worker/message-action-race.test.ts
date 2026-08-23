import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { updateMessageAction } from "../../../worker/features/messages/queries";
import { applyCurrentMigrations } from "./current-migrations";

const messageId = "msg_action_race";
const newerTrashedAt = "2026-08-19T14:00:00.000Z";

describe("message action concurrency", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    const timestamp = "2026-08-19T12:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_action_race', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_action_race', 'race@example.com', 'dom_action_race', 'Race', 1, ?, ?)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES ('thr_action_race', 'race', ?, ?, ?)`
      ).bind(timestamp, timestamp, timestamp)
    ]);
  });

  beforeEach(async () => {
    const timestamp = "2026-08-19T12:00:00.000Z";
    await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId).run();
    await env.DB.prepare(
      `INSERT INTO messages (
         id, thread_id, mailbox_id, is_unassigned, direction, folder,
         from_address, to_json, cc_json, bcc_json, subject, snippet, text_body,
         references_json, received_at, archived_at, has_attachments, created_at, updated_at
       ) VALUES (?, 'thr_action_race', 'mbx_action_race', 0, 'inbound', 'archived',
         'sender@example.com', '["race@example.com"]', '[]', '[]', 'Race', 'Race', 'Race',
         '[]', ?, ?, 0, ?, ?)`
    )
      .bind(messageId, timestamp, timestamp, timestamp, timestamp)
      .run();
  });

  it("does not clear a newer trash action during unarchive", async () => {
    await updateMessageAction(databaseWithInterleavedTrash(env.DB), messageId, "unarchive");

    const row = await env.DB.prepare("SELECT folder, trashed_at FROM messages WHERE id = ?")
      .bind(messageId)
      .first<{ folder: string; trashed_at: string | null }>();
    expect(row).toEqual({ folder: "trash", trashed_at: newerTrashedAt });
  });
});

function databaseWithInterleavedTrash(db: D1Database): D1Database {
  let injected = false;
  return {
    prepare(query: string) {
      const statement = db.prepare(query);
      if (injected || !query.includes("SELECT messages.*")) {
        return statement;
      }
      return {
        bind(...values: unknown[]) {
          const bound = statement.bind(...values);
          return {
            async all<T>() {
              const result = await bound.all<T>();
              injected = true;
              await db
                .prepare(
                  "UPDATE messages SET folder = 'trash', trashed_at = ?, updated_at = ? WHERE id = ?"
                )
                .bind(newerTrashedAt, newerTrashedAt, messageId)
                .run();
              return result;
            }
          } as unknown as D1PreparedStatement;
        }
      } as unknown as D1PreparedStatement;
    }
  } as D1Database;
}

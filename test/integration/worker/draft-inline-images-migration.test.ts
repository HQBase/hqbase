import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import draftInlineImagesMigration from "../../../migrations/0024_draft_inline_images.sql?raw";
import { migrationStatements } from "./migration-statements";

describe("draft inline images migration", () => {
  beforeAll(async () => {
    await env.DB.prepare(
      `CREATE TABLE draft_attachments (
         id TEXT PRIMARY KEY NOT NULL,
         draft_id TEXT NOT NULL,
         filename TEXT NOT NULL,
         content_type TEXT NOT NULL,
         size_bytes INTEGER NOT NULL,
         r2_key TEXT NOT NULL UNIQUE,
         created_at TEXT NOT NULL
       )`
    ).run();
    await env.DB.prepare(
      `INSERT INTO draft_attachments
       (id, draft_id, filename, content_type, size_bytes, r2_key, created_at)
       VALUES
         ('att_existing_one', 'drf_existing', 'one.png', 'image/png', 1, 'drafts/one', 'now'),
         ('att_existing_two', 'drf_existing', 'two.png', 'image/png', 1, 'drafts/two', 'now')`
    ).run();
    for (const statement of migrationStatements(draftInlineImagesMigration)) {
      await env.DB.prepare(statement).run();
    }
  });

  it("keeps existing attachments non-inline and enforces unique non-null content IDs", async () => {
    const rows = await env.DB.prepare(
      "SELECT id, content_id FROM draft_attachments ORDER BY id"
    ).all<{ id: string; content_id: string | null }>();
    expect(rows.results).toEqual([
      { id: "att_existing_one", content_id: null },
      { id: "att_existing_two", content_id: null }
    ]);

    await env.DB.prepare(
      "UPDATE draft_attachments SET content_id = 'att_existing_one@hqbase.invalid' WHERE id = 'att_existing_one'"
    ).run();
    await expect(
      env.DB.prepare(
        "UPDATE draft_attachments SET content_id = 'att_existing_one@hqbase.invalid' WHERE id = 'att_existing_two'"
      ).run()
    ).rejects.toThrow(/UNIQUE constraint failed/);

    const indexes = await env.DB.prepare("PRAGMA index_list('draft_attachments')").all<{
      name: string;
      partial: number;
    }>();
    expect(indexes.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "draft_attachments_content_id_uidx", partial: 1 })
      ])
    );
  });
});

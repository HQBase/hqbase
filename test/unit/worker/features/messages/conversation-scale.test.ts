import { DatabaseSync } from "node:sqlite";
import { listConversationPage } from "@worker/features/messages/conversation-queries";
import { expect, it } from "vitest";

it("keeps large inbox pages scoped and searchable without copying bodies into normal listings", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`CREATE TABLE messages (
      id TEXT PRIMARY KEY, thread_id TEXT, mailbox_id TEXT, is_unassigned INTEGER,
      direction TEXT, folder TEXT, from_address TEXT, from_name TEXT, to_json TEXT,
      cc_json TEXT, bcc_json TEXT, subject TEXT, snippet TEXT, text_body TEXT,
      received_at TEXT, sent_at TEXT, created_at TEXT, read_at TEXT, starred_at TEXT,
      has_attachments INTEGER);
      WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<10000)
      INSERT INTO messages SELECT printf('message-%05d',i), printf('thread-%05d',(i-1)/4),
        CASE WHEN i%2=0 THEN 'allowed' ELSE 'private' END, 0, 'inbound', 'inbox',
        'sender@example.test', 'Sender', '["owner@example.test"]', '[]', '[]',
        'Synthetic message', 'Fixture', CASE WHEN i%100=0 THEN 'needle' ELSE printf('%.*c',4096,'x') END,
        printf('2026-09-%02dT12:00:00Z',1+i%28), NULL, '2026-09-01', NULL, NULL, 0 FROM n;`);
    let listingSql = "";
    let listingParams: unknown[] = [];
    const client = {
      prepare(query: string) {
        return {
          bind(...params: unknown[]) {
            return {
              all: async () => {
                listingSql = query;
                listingParams = params;
                return { results: database.prepare(query).all(...(params as never[])) };
              }
            };
          }
        };
      }
    } as unknown as D1Database;
    const filters = {
      scope: { mailboxIds: ["allowed"], includeUnassigned: false },
      folder: "inbox" as const,
      limit: 50
    };
    const first = await listConversationPage(client, filters);
    const compact = listingSql;
    const params = listingParams;
    const wide = compact.replace(
      /SELECT messages\.id,[\s\S]*?COALESCE\(messages.received_at/,
      "SELECT messages.*, COALESCE(messages.received_at"
    );
    const timed = (query: string) => {
      const start = performance.now();
      const rows = database.prepare(query).all(...(params as never[]));
      return { rows, ms: performance.now() - start };
    };
    const previous = timed(wide);
    const current = timed(compact);
    expect(first.totalCount).toBe(2500);
    expect(first.conversations).toHaveLength(50);
    expect(first.conversations.every((row) => row.mailboxId === "allowed")).toBe(true);
    expect(current.rows.map((row) => row.id)).toEqual(previous.rows.map((row) => row.id));
    expect(current.rows.every((row) => row.text_body === null)).toBe(true);
    const second = await listConversationPage(client, {
      ...filters,
      cursor: first.nextCursor ?? undefined
    });
    expect(
      second.conversations.every(
        (row) => !first.conversations.some((firstRow) => firstRow.threadId === row.threadId)
      )
    ).toBe(true);
    const search = await listConversationPage(client, { ...filters, search: "needle" });
    expect(search.totalCount).toBe(100);
    console.info(
      `Synthetic 10,000-message query: wide=${previous.ms.toFixed(1)}ms compact=${current.ms.toFixed(1)}ms`
    );
  } finally {
    database.close();
  }
});

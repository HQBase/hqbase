import { listThreadMessages } from "@worker/features/messages/queries";
import type { MessageRow } from "@worker/features/messages/types";
import { describe, expect, it, vi } from "vitest";

const row: MessageRow = {
  id: "msg_1",
  thread_id: "thr_1",
  mailbox_id: "mbx_allowed",
  direction: "inbound",
  folder: "inbox",
  from_address: "customer@example.com",
  to_json: '["support@example.com"]',
  cc_json: "[]",
  bcc_json: "[]",
  delivered_to_address: "support@example.com",
  subject: "Account access",
  snippet: "Help",
  text_body: "Help",
  html_r2_key: null,
  raw_r2_key: null,
  message_id: "<message@example.com>",
  dedupe_key: "dedupe-1",
  in_reply_to: null,
  references_json: "[]",
  received_at: "2026-07-27T14:00:00.000Z",
  sent_at: null,
  read_at: null,
  starred_at: null,
  archived_at: null,
  trashed_at: null,
  has_attachments: 0,
  created_at: "2026-07-27T14:00:00.000Z",
  updated_at: "2026-07-27T14:00:00.000Z"
};

describe("message threads", () => {
  it("loads messages chronologically from only accessible mailboxes", async () => {
    const threadBind = vi.fn(() => ({ all: vi.fn(async () => ({ results: [row] })) }));
    const attachmentBind = vi.fn(() => ({ all: vi.fn(async () => ({ results: [] })) }));
    const prepare = vi.fn((sql: string) =>
      sql.includes("FROM message_attachments") ? { bind: attachmentBind } : { bind: threadBind }
    );

    const result = await listThreadMessages({ prepare } as unknown as D1Database, "thr_1", [
      "mbx_allowed",
      "mbx_second"
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "msg_1",
      attachments: [],
      deliveredToAddress: "support@example.com"
    });
    expect(prepare.mock.calls[0]?.[0]).toContain("ORDER BY COALESCE");
    expect(prepare.mock.calls[0]?.[0]).toContain("delivered_to_address_id");
    expect(threadBind).toHaveBeenCalledWith("thr_1", "mbx_allowed", "mbx_second");
  });

  it("does not query when no mailbox is accessible", async () => {
    const prepare = vi.fn();
    await expect(
      listThreadMessages({ prepare } as unknown as D1Database, "thr_1", [])
    ).resolves.toEqual([]);
    expect(prepare).not.toHaveBeenCalled();
  });
});

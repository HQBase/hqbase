import { describe, expect, it, vi } from "vitest";

vi.mock("@worker/db/client", () => ({
  newId: vi.fn(() => "thr_new"),
  nowIso: vi.fn(() => "2026-07-28T16:00:00.000Z")
}));

import { resolveInboundThread } from "@worker/features/messages/threading";

describe("message threading", () => {
  it("reuses the thread referenced by In-Reply-To before subject matching", async () => {
    const first = vi.fn(async () => ({ thread_id: "thr_existing" }));
    const run = vi.fn(async () => ({ success: true }));
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => (sql.includes("WITH candidates") ? { first } : { run }))
    }));
    const db = { prepare } as unknown as D1Database;

    const threadId = await resolveInboundThread(db, {
      inReplyTo: "<parent@example.com>",
      lastMessageAt: "2026-07-28T15:00:00.000Z",
      mailboxId: "mbx_1",
      references: ["<root@example.com>"],
      subject: "Re: Reused subject"
    });

    expect(threadId).toBe("thr_existing");
    expect(prepare.mock.calls[0]?.[0]).toContain("messages.message_id = candidates.value");
    expect(first).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it("creates a new thread when headers do not reference a stored message", async () => {
    const first = vi.fn(async () => null);
    const run = vi.fn(async () => ({ success: true }));
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => (sql.includes("WITH candidates") ? { first } : { run }))
    }));
    const db = { prepare } as unknown as D1Database;

    const threadId = await resolveInboundThread(db, {
      inReplyTo: null,
      lastMessageAt: "2026-07-28T15:00:00.000Z",
      mailboxId: "mbx_1",
      references: [],
      subject: "Repeated subject"
    });

    expect(threadId).toBe("thr_new");
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0]?.[0]).toContain("INSERT INTO threads");
  });
});

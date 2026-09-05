import { createExecutionContext, env, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "../../../worker/auth/auth";
import type { ParsedEmail } from "../../../worker/email/parse-email";
import { parseRawEmail } from "../../../worker/email/parse-email";
import { storeInboundEmail } from "../../../worker/email/store-email";
import { getDraft, saveDraft } from "../../../worker/features/drafts/queries";
import { labelsForThreadIds } from "../../../worker/features/labels/queries";
import { getMessageDetail } from "../../../worker/features/messages/queries";
import { sendNewMessage } from "../../../worker/features/send/service";
import { consumeJobs, removeExpiredOrphanedObjects } from "../../../worker/jobs/consumer";
import { applyRetention } from "../../../worker/jobs/maintenance";
import type { Job } from "../../../worker/jobs/types";
import type { WorkerEnv } from "../../../worker/lib/env";
import { apiRoutes } from "../../../worker/routes";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
let userId: string;
let cookie: string;
const stamp = "2026-09-04T00:00:00.000Z";
const draftInput = {
  mailboxId: "mbx_audit",
  replyToMessageId: null,
  forwardOfMessageId: null,
  from: "audit@example.com",
  to: ["recipient@example.net"],
  cc: [],
  bcc: [],
  subject: "Audit fixture",
  text: "Synthetic audit text",
  html: ""
};
function incoming(filename = "fixture.txt"): {
  envelopeRecipient: string;
  mailboxId: string;
  raw: ArrayBuffer;
  parsed: ParsedEmail;
} {
  return {
    envelopeRecipient: "audit@example.com",
    mailboxId: "mbx_audit",
    raw: new TextEncoder().encode("Synthetic audit raw data").buffer,
    parsed: {
      fromAddress: "sender@example.net",
      fromName: null,
      to: ["audit@example.com"],
      cc: [],
      bcc: [],
      subject: "Audit inbound",
      date: stamp,
      messageId: "<audit-inbound@example.net>",
      inReplyTo: null,
      references: [],
      textBody: "Synthetic audit text",
      htmlBody: "<p>Synthetic audit text</p>",
      snippet: "Audit",
      attachments: [
        {
          filename,
          contentType: "text/plain",
          contentId: null,
          disposition: "attachment",
          content: new TextEncoder().encode("fixture")
        }
      ]
    }
  };
}
function queueMessage(job: Job) {
  return { id: "queue-audit", body: job, ack: vi.fn(), retry: vi.fn() };
}
async function consume(message: ReturnType<typeof queueMessage>, bindings: WorkerEnv) {
  await consumeJobs({ messages: [message] } as unknown as MessageBatch<Job>, bindings);
}

describe("Mail integrity and concurrency regressions", () => {
  beforeEach(async () => {
    await applyCurrentMigrations();
    await env.DB.batch(
      [
        "send_operations",
        "operation_runs",
        "messages",
        "threads",
        "drafts",
        "mailboxes",
        "mail_domains",
        "user"
      ].map((table) => env.DB.prepare(`DELETE FROM "${table}"`))
    );
    const response = await createAuth(env, new Request(origin)).handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({
          email: "audit@login.example",
          name: "Audit fixture",
          password: "audit-test-password-123",
          rememberMe: false
        })
      })
    );
    expect(response.status).toBe(200);
    userId = (await response.json<{ user: { id: string } }>()).user.id;
    cookie =
      (response.headers.get("set-cookie") ?? "").match(
        /(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/
      )?.[1] ?? "";
    expect(cookie).not.toBe("");
    await env.DB.batch([
      env.DB.prepare(`UPDATE "user" SET role = 'owner' WHERE id = ?`).bind(userId),
      env.DB.prepare(
        `INSERT INTO mail_domains (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at) VALUES ('dom_audit', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(stamp, stamp),
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, mail_domain_id, display_name, is_active, created_at, updated_at) VALUES ('mbx_audit', 'audit@example.com', 'dom_audit', 'Audit', 1, ?, ?)`
      ).bind(stamp, stamp)
    ]);
  });

  it("rejects one of two concurrent saves at the same draft version", async () => {
    const initial = await saveDraft(env.DB, userId, draftInput);
    const results = await Promise.allSettled([
      saveDraft(env.DB, userId, {
        ...draftInput,
        id: initial.id,
        version: initial.version,
        text: "First edit"
      }),
      saveDraft(env.DB, userId, {
        ...draftInput,
        id: initial.id,
        version: initial.version,
        text: "Second edit"
      })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((await getDraft(env.DB, userId, initial.id))?.version).toBe(2);
  });

  it("retries the whole inbound commit after attachment storage fails", async () => {
    const input = incoming();
    const bucket = {
      put: vi.fn(async (key: string, body: unknown, options: unknown) => {
        if (key.includes("/attachments/")) throw new Error("Injected attachment storage failure");
        return env.MAIL_OBJECTS.put(key, body as never, options as never);
      })
    } as unknown as R2Bucket;
    await expect(storeInboundEmail(env.DB, bucket, input)).rejects.toThrow("Injected");
    const retry = await storeInboundEmail(env.DB, env.MAIL_OBJECTS, input);
    expect(retry.inserted).toBe(true);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM message_attachments").first("count")
    ).toBe(1);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM messages").first("count")).toBe(1);
  });

  it("recovers an accepted send without sending again after D1 storage fails", async () => {
    const draft = await saveDraft(env.DB, userId, draftInput);
    const send = vi.fn().mockResolvedValue({ messageId: "provider-accepted" });
    const failingDb = new Proxy(env.DB, {
      get(target, property) {
        if (property === "prepare")
          return (query: string) => {
            if (/insert into "threads"/i.test(query))
              throw new Error("Injected sent-record failure");
            return target.prepare(query);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const bindings = { ...env, DB: failingDb, MAIL_SENDER: { send } } as unknown as WorkerEnv;
    const input = { ...draftInput, draftId: draft.id, attachmentIds: [] };
    await expect(sendNewMessage(bindings, input, userId)).rejects.toThrow("accepted");
    expect(await getDraft(env.DB, userId, draft.id)).not.toBeNull();
    await sendNewMessage({ ...bindings, DB: env.DB }, input, userId);
    expect(send).toHaveBeenCalledOnce();
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM messages WHERE direction = 'outbound'"
      ).first("count")
    ).toBe(1);
  });

  it("runs failed jobs again instead of acknowledging a failed record", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("Injected list failure"))
      .mockResolvedValue({ objects: [], truncated: false });
    const bindings = { ...env, MAIL_OBJECTS: { list } } as unknown as WorkerEnv;
    const job: Job = { id: "integrity:retry", kind: "integrity-scan", requestedAt: stamp };
    const first = queueMessage(job);
    await consume(first, bindings);
    expect(first.retry).toHaveBeenCalledOnce();
    const retry = queueMessage(job);
    await consume(retry, bindings);
    expect(retry.ack).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledTimes(2);
    expect(
      await env.DB.prepare("SELECT status FROM operation_runs WHERE id = ?")
        .bind(job.id)
        .first("status")
    ).toBe("succeeded");
  });

  it("resumes a saved scan cursor when queue continuation publication fails", async () => {
    const job: Job = { id: "scan-continuation", kind: "integrity-scan", requestedAt: stamp };
    const list = vi
      .fn()
      .mockResolvedValueOnce({ objects: [], truncated: true, cursor: "second-page" })
      .mockResolvedValueOnce({ objects: [], truncated: false });
    const send = vi.fn().mockRejectedValueOnce(new Error("Queue unavailable"));
    const bindings = {
      ...env,
      MAIL_OBJECTS: { list },
      HQBASE_JOBS: { send }
    } as unknown as WorkerEnv;
    const first = queueMessage(job);
    await consume(first, bindings);
    expect(first.retry).toHaveBeenCalledOnce();
    const retry = queueMessage(job);
    await consume(retry, bindings);
    expect(list).toHaveBeenLastCalledWith({ cursor: "second-page", limit: 1000 });
    expect(retry.ack).toHaveBeenCalledOnce();
    const duplicate = queueMessage(job);
    await consume(duplicate, bindings);
    expect(duplicate.ack).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("does not let a duplicate delivery take an active job lease", async () => {
    const job: Job = { id: "scan-lease", kind: "integrity-scan", requestedAt: stamp };
    let start = () => {};
    let finish = () => {};
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const list = vi.fn(async () => {
      start();
      await pending;
      return { objects: [], truncated: false };
    });
    const bindings = { ...env, MAIL_OBJECTS: { list } } as unknown as WorkerEnv;
    const first = queueMessage(job);
    const active = consume(first, bindings);
    await started;
    const duplicate = queueMessage(job);
    await consume(duplicate, bindings);
    expect(duplicate.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    finish();
    await active;
    expect(first.ack).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledOnce();
  });

  it("stores an accepted send when only the independent receipt write fails", async () => {
    const draft = await saveDraft(env.DB, userId, draftInput);
    const bucket = new Proxy(env.MAIL_OBJECTS, {
      get(target, property) {
        if (property === "put")
          return (key: string, value: unknown, options: unknown) => {
            if (key.endsWith("/receipt.json"))
              return Promise.reject(new Error("Receipt unavailable"));
            return target.put(key, value as never, options as never);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const send = vi.fn().mockResolvedValue({ messageId: "provider-receipt-fallback" });
    const bindings = {
      ...env,
      MAIL_OBJECTS: bucket,
      MAIL_SENDER: { send }
    } as unknown as WorkerEnv;
    const input = { ...draftInput, draftId: draft.id, attachmentIds: [] };
    const result = await sendNewMessage(bindings, input, userId);
    expect((await sendNewMessage(bindings, input, userId)).id).toBe(result.id);
    expect(send).toHaveBeenCalledOnce();
  });

  it("waits for draft protection before sending during an update", async () => {
    const trigger = await env.DB.prepare(
      "SELECT sql FROM sqlite_schema WHERE name = 'drafts_before_update_pending_send'"
    ).first<string>("sql");
    if (!trigger) throw new Error("Test guard is missing");
    await env.DB.prepare("DROP TRIGGER drafts_before_update_pending_send").run();
    const send = vi.fn();
    try {
      await expect(
        sendNewMessage(
          { ...env, MAIL_SENDER: { send } } as unknown as WorkerEnv,
          {
            from: draftInput.from,
            to: draftInput.to,
            cc: [],
            bcc: [],
            subject: "Update fixture",
            text: "Synthetic body",
            attachmentIds: [],
            idempotencyKey: "during-update"
          },
          userId
        )
      ).rejects.toMatchObject({ code: "SEND_STORAGE_NOT_READY" });
      expect(send).not.toHaveBeenCalled();
    } finally {
      await env.DB.prepare(trigger).run();
    }
  });

  it("does not reproduce a Worker error for a Unicode filename", async () => {
    const stored = await storeInboundEmail(env.DB, env.MAIL_OBJECTS, incoming("报告.txt"));
    const attachment = await env.DB.prepare(
      "SELECT id FROM message_attachments WHERE message_id = ?"
    )
      .bind(stored.message.id)
      .first<{ id: string }>();
    const response = await SELF.fetch(`${origin}/api/v2/attachments/${attachment?.id}`, {
      headers: { cookie }
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fixture");
  });

  it("tests whether alternate signup paths reach the disabled endpoint", async () => {
    const results: Array<{ path: string; status: number }> = [];
    for (const [index, path] of [
      "/api/auth/sign-up/email/",
      "/api/auth//sign-up/email",
      "/api/auth/%73ign-up/email",
      "/api/auth/sign-up%2Femail"
    ].entries()) {
      const response = await SELF.fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({
          email: `audit-variant-${index}@login.example`,
          name: "Audit fixture",
          password: "audit-test-password-123"
        })
      });
      results.push({ path, status: response.status });
    }
    expect(results.every((result) => result.status !== 200)).toBe(true);
  });

  it("keeps one active owner when owner demotions run together", async () => {
    await env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, role, createdAt, updatedAt)
      VALUES ('audit_second_owner', 'Second', 'second@audit.example', 1, 'owner', ?, ?)`)
      .bind(stamp, stamp)
      .run();
    const contexts = [createExecutionContext(), createExecutionContext()];
    const responses = await Promise.all(
      [userId, "audit_second_owner"].map((id, index) =>
        apiRoutes.fetch(
          new Request(`${origin}/api/users/${id}`, {
            method: "PATCH",
            headers: { cookie, origin, "content-type": "application/json" },
            body: JSON.stringify({ role: "member" })
          }),
          env,
          contexts[index]
        )
      )
    );
    await Promise.all(contexts.map((context) => waitOnExecutionContext(context)));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(
      await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM "user" WHERE role = 'owner' AND COALESCE(banned, 0) = 0`
      ).first("count")
    ).toBe(1);
  });

  it("rejects session writes from sibling origins and non-JSON media types", async () => {
    for (const [requestOrigin, contentType, status] of [
      ["https://untrusted.hqbase.test", "application/json", 403],
      ["https://untrusted.hqbase.test", "text/plain", 403],
      [origin, "text/plain", 415],
      ["null", "application/json", 403]
    ] as const) {
      const response = await SELF.fetch(`${origin}/api/v2/drafts`, {
        method: "POST",
        headers: { cookie, origin: requestOrigin, "content-type": contentType },
        body: JSON.stringify(draftInput)
      });
      expect(response.status).toBe(status);
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM drafts").first("count")).toBe(0);
  });

  it("applies the 30-day Trash default without a policy row", async () => {
    const stored = await storeInboundEmail(env.DB, env.MAIL_OBJECTS, incoming());
    await env.DB.prepare(
      "UPDATE messages SET folder = 'trash', trashed_at = '2000-01-01T00:00:00.000Z', created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?"
    )
      .bind(stored.message.id)
      .run();
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM retention_policies").first("count")
    ).toBe(0);
    await applyRetention(env, stamp);
    expect(
      await env.DB.prepare("SELECT id FROM messages WHERE id = ?")
        .bind(stored.message.id)
        .first("id")
    ).toBeNull();
  });

  it("uses two bound sets for 100 threads and one mailbox", async () => {
    let largestBind = 0;
    const database = new Proxy(env.DB, {
      get(target, property) {
        if (property === "prepare")
          return (query: string) => {
            const statement = target.prepare(query);
            return new Proxy(statement, {
              get(stmt, key) {
                if (key === "bind")
                  return (...values: unknown[]) => {
                    largestBind = Math.max(largestBind, values.length);
                    return stmt.bind(...values);
                  };
                const value = Reflect.get(stmt, key);
                return typeof value === "function" ? value.bind(stmt) : value;
              }
            });
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    await labelsForThreadIds(
      database,
      Array.from({ length: 100 }, (_, i) => `thread_${i}`),
      { mailboxIds: ["mbx_audit"], includeUnassigned: true }
    ).catch(() => undefined);
    expect(largestBind).toBe(2);
  });

  it("uses one D1 query for a bounded R2 page", async () => {
    let queries = 0;
    const database = new Proxy(env.DB, {
      get(target, property) {
        if (property === "prepare")
          return (query: string) => {
            queries += 1;
            return target.prepare(query);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        objects: Array.from({ length: 1000 }, (_, i) => ({
          key: `old-${i}`,
          uploaded: new Date("2000-01-01")
        })),
        truncated: true,
        cursor: "next"
      })
      .mockResolvedValueOnce({
        objects: [{ key: "old-1000", uploaded: new Date("2000-01-01") }],
        truncated: false
      });
    const bindings = {
      ...env,
      DB: database,
      MAIL_OBJECTS: { list, delete: vi.fn().mockResolvedValue(undefined) }
    } as unknown as WorkerEnv;
    await removeExpiredOrphanedObjects(bindings);
    expect(queries).toBe(1);
    expect(list).toHaveBeenCalledOnce();
  });
  it("preserves a large plain-text body and Reply-To while bounding D1 search text", async () => {
    const text = "abcd😀".repeat(500_000);
    const parsed = await parseRawEmail(
      new TextEncoder().encode(
        "From: sender@example.net\r\nReply-To: customer@example.net\r\nTo: audit@example.com\r\nSubject: Large text\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" +
          text
      ).buffer
    );
    expect(parsed.replyTo).toEqual(["customer@example.net"]);
    const result = await storeInboundEmail(env.DB, env.MAIL_OBJECTS, { ...incoming(), parsed });
    const row = await env.DB.prepare("SELECT text_body, text_r2_key FROM messages WHERE id = ?")
      .bind(result.message.id)
      .first<{ text_body: string; text_r2_key: string }>();
    expect(new TextEncoder().encode(row?.text_body).byteLength).toBeLessThanOrEqual(256 * 1024);
    expect(row?.text_r2_key).toBeTruthy();
    const stored = await getMessageDetail(env.DB, result.message.id, env.MAIL_OBJECTS);
    expect(stored?.textBody).toBe(parsed.textBody);
    expect(stored?.replyTo).toEqual(["customer@example.net"]);
  });

  it("blocks a second provider call after an uncertain outcome and locks the draft", async () => {
    const draft = await saveDraft(env.DB, userId, draftInput);
    const send = vi.fn().mockRejectedValue(new Error("Provider timeout"));
    const bindings = { ...env, MAIL_SENDER: { send } } as unknown as WorkerEnv;
    const input = { ...draftInput, draftId: draft.id, attachmentIds: [] };
    await expect(sendNewMessage(bindings, input, userId)).rejects.toThrow("uncertain");
    await expect(sendNewMessage(bindings, input, userId)).rejects.toThrow("uncertain");
    expect(send).toHaveBeenCalledOnce();
    await expect(
      saveDraft(env.DB, userId, {
        ...draftInput,
        id: draft.id,
        version: draft.version,
        text: "Changed"
      })
    ).rejects.toThrow();
  });
});

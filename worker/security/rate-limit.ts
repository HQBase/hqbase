import { AppError } from "../lib/errors";

const encoder = new TextEncoder();

async function subjectHash(secret: string, scope: string, subject: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${scope}:${subject.trim().toLowerCase()}`)
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRateLimit(
  db: D1Database,
  secret: string,
  input: { scope: string; subject: string; limit: number; windowSeconds: number }
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % input.windowSeconds);
  const hash = await subjectHash(secret, input.scope, input.subject);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits
       (scope, subject_hash, window_start, request_count, expires_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(scope, subject_hash, window_start) DO UPDATE SET
         request_count = request_count + 1
       RETURNING request_count`
    )
    .bind(input.scope, hash, windowStart, windowStart + input.windowSeconds * 2)
    .first<{ request_count: number }>();
  if ((row?.request_count ?? 1) > input.limit) {
    throw new AppError("RATE_LIMITED", "Too many requests. Try again later.", 429);
  }
}

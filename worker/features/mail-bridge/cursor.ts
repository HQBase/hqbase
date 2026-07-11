import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { secureHashEqual } from "../app-passwords/crypto";

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function cursorSignature(seq: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`v2:${seq}`)))
  );
}

export async function encodeCursor(seq: number, secret: string): Promise<string> {
  return `v2.${seq}.${await cursorSignature(seq, secret)}`;
}

export async function decodeCursor(cursor: string, secret: string): Promise<number> {
  const match = /^v2\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(cursor);
  if (!match) throw new AppError("CURSOR_INVALID", "Synchronization cursor is invalid.", 400);
  const seq = Number(match[1]);
  const expected = await cursorSignature(seq, secret);
  if (!secureHashEqual(expected, match[2] ?? "")) {
    throw new AppError("CURSOR_INVALID", "Synchronization cursor is invalid.", 400);
  }
  return seq;
}

export async function currentCursor(env: WorkerEnv): Promise<string> {
  const row = await env.DB.prepare(
    "SELECT COALESCE(MAX(seq), 0) AS seq FROM pro_message_changes"
  ).first<{ seq: number }>();
  return encodeCursor(row?.seq ?? 0, env.PRO_SESSION_SECRET);
}

import { type Context, Hono } from "hono";
import { z } from "zod";

import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { enforceRateLimit } from "../../security/rate-limit";
import { verifyAppPassword } from "../app-passwords/queries";
import { listMailboxesForUser } from "../mailboxes/queries";
import { currentCursor } from "./cursor";
import { applyMutation } from "./mutations";
import { rawMessageResponse } from "./raw";
import { inspectBridgeReadiness } from "./readiness";
import { createMailSession, requireMailSession, verifyBridgeToken } from "./session";
import { submitMessage } from "./submission";
import { ensureMailboxesV2, listChanges, listMailboxMessages } from "./sync";

const authenticateSchema = z.object({
  username: z.string().email(),
  password: z.string().min(1).max(256)
});
const pageSchema = z.object({
  afterUid: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(100)
});
const changesSchema = z.object({
  cursor: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(100)
});
const submissionSchema = z.object({
  idempotencyKey: z.string().min(16).max(200),
  mailFrom: z.string().email(),
  recipients: z.array(z.string().email()).min(1).max(50),
  raw: z.string().min(1)
});
const mutationSchema = z.object({
  idempotencyKey: z.string().min(16).max(200),
  operation: z.enum(["store-flags", "expunge", "append", "copy"]),
  mailbox: z.string().min(1).max(200),
  target: z.string().min(1).max(1000).optional(),
  destination: z.string().min(1).max(200).optional(),
  flags: z.array(z.string().max(40)).max(40).optional(),
  raw: z.string().max(36_000_000).optional()
});

async function requireSession(c: Context<HonoApp>) {
  const session = await requireMailSession(c.env, c.req.raw);
  if (!session) {
    throw new AppError("MAIL_SESSION_INVALID", "Mail session is invalid or expired.", 401);
  }
  return session;
}

export const mailBridgeV2Routes = new Hono<HonoApp>();

mailBridgeV2Routes.use("*", async (c, next) => {
  if (!verifyBridgeToken(c.req.raw, c.env.PRO_BRIDGE_TOKEN)) {
    throw new AppError("BRIDGE_UNAUTHENTICATED", "Bridge authentication failed.", 401);
  }
  await next();
});

mailBridgeV2Routes.get("/ready", async (c) => {
  const readiness = await inspectBridgeReadiness(c.env);
  return c.json(readiness, readiness.ready ? 200 : 503);
});

mailBridgeV2Routes.post("/authenticate", async (c) => {
  const input = parseWith(authenticateSchema, await readJson(c.req.raw));
  await Promise.all([
    enforceRateLimit(c.env.DB, c.env.PRO_SESSION_SECRET, {
      scope: "bridge.auth.username",
      subject: input.username,
      limit: 10,
      windowSeconds: 15 * 60
    }),
    enforceRateLimit(c.env.DB, c.env.PRO_SESSION_SECRET, {
      scope: "bridge.auth.ip",
      subject: c.req.header("cf-connecting-ip") ?? "unknown",
      limit: 60,
      windowSeconds: 15 * 60
    })
  ]);
  const verified = await verifyAppPassword(
    c.env.DB,
    input.username,
    input.password,
    c.env.PRO_APP_PASSWORD_PEPPER
  );
  if (!verified) throw new AppError("AUTHENTICATION_FAILED", "Authentication failed.", 401);
  const [accessToken, mailboxes, imapMailboxes, cursor] = await Promise.all([
    createMailSession(c.env, verified.userId, verified.appPasswordId),
    listMailboxesForUser(c.env.DB, verified.userId, verified.role),
    ensureMailboxesV2(c.env.DB, verified.userId, verified.role),
    currentCursor(c.env)
  ]);
  return c.json({
    accessToken,
    subject: verified.userId,
    username: input.username,
    allowedFrom: mailboxes
      .filter(
        (mailbox) =>
          mailbox.isActive && (mailbox.accessLevel === "agent" || mailbox.accessLevel === "manager")
      )
      .flatMap((mailbox) =>
        mailbox.addresses.length
          ? mailbox.addresses
              .filter((address) => address.sendEnabled)
              .map((address) => address.address)
          : [mailbox.address]
      ),
    cursor,
    mailboxes: imapMailboxes.map((mailbox) => ({
      id: mailbox.id,
      name: mailbox.name,
      ...(mailbox.special_use ? { specialUse: mailbox.special_use } : {}),
      uidValidity: mailbox.uid_validity,
      uidNext: mailbox.uid_next
    }))
  });
});

mailBridgeV2Routes.get("/mailboxes/:mailboxId/messages", async (c) => {
  const session = await requireSession(c);
  const input = parseWith(pageSchema, c.req.query());
  return c.json(
    await listMailboxMessages(
      c.env,
      session.userId,
      session.role,
      c.req.param("mailboxId"),
      input.afterUid,
      input.limit
    )
  );
});

mailBridgeV2Routes.get("/changes", async (c) => {
  const session = await requireSession(c);
  const input = parseWith(changesSchema, c.req.query());
  return c.json(await listChanges(c.env, session.userId, session.role, input.cursor, input.limit));
});

mailBridgeV2Routes.get("/mailboxes/:mailboxId/messages/:uid/raw", async (c) => {
  const session = await requireSession(c);
  const uid = z.coerce.number().int().positive().parse(c.req.param("uid"));
  return rawMessageResponse(
    c.env,
    session.userId,
    c.req.param("mailboxId"),
    uid,
    c.req.header("range") ?? null
  );
});

mailBridgeV2Routes.post("/submit", async (c) => {
  const session = await requireSession(c);
  await enforceRateLimit(c.env.DB, c.env.PRO_SESSION_SECRET, {
    scope: "bridge.submit",
    subject: session.userId,
    limit: 60,
    windowSeconds: 60
  });
  await submitMessage(c.env, session, parseWith(submissionSchema, await readJson(c.req.raw)));
  return c.body(null, 204);
});

mailBridgeV2Routes.post("/mutations", async (c) => {
  const session = await requireSession(c);
  await enforceRateLimit(c.env.DB, c.env.PRO_SESSION_SECRET, {
    scope: "bridge.mutation",
    subject: session.userId,
    limit: 240,
    windowSeconds: 60
  });
  await applyMutation(c.env, session, parseWith(mutationSchema, await readJson(c.req.raw)));
  return c.body(null, 204);
});

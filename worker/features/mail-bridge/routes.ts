import { Hono } from "hono";
import { z } from "zod";

import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { verifyAppPassword } from "../app-passwords/queries";
import { listMailboxes } from "../mailboxes/queries";
import { applyMutation } from "./mutations";
import { createMailSession, requireMailSession, verifyBridgeToken } from "./session";
import { buildSnapshot } from "./snapshot";
import { submitMessage } from "./submission";

const authenticateSchema = z.object({
  username: z.string().email(),
  password: z.string().min(1).max(256)
});
const submissionSchema = z.object({
  idempotencyKey: z.string().min(16).max(200),
  mailFrom: z.string().email(),
  recipients: z.array(z.string().email()).min(1).max(50),
  raw: z.string().min(1)
});
const mutationSchema = z.object({
  idempotencyKey: z.string().min(16).max(200),
  operation: z.string().min(1).max(40),
  mailbox: z.string().max(200).optional(),
  target: z.string().max(1000).optional(),
  destination: z.string().max(200).optional(),
  flags: z.array(z.string().max(40)).max(40).optional(),
  raw: z.string().optional()
});

export const mailBridgeRoutes = new Hono<HonoApp>();

mailBridgeRoutes.use("*", async (c, next) => {
  if (!verifyBridgeToken(c.req.raw, c.env.PRO_BRIDGE_TOKEN)) {
    throw new AppError("BRIDGE_UNAUTHENTICATED", "Bridge authentication failed.", 401);
  }
  await next();
});

mailBridgeRoutes.post("/authenticate", async (c) => {
  const input = parseWith(authenticateSchema, await readJson(c.req.raw));
  const verified = await verifyAppPassword(
    c.env.DB,
    input.username,
    input.password,
    c.env.PRO_APP_PASSWORD_PEPPER
  );
  if (!verified) throw new AppError("AUTHENTICATION_FAILED", "Authentication failed.", 401);
  const [accessToken, mailboxes, snapshot] = await Promise.all([
    createMailSession(c.env, verified.userId, verified.appPasswordId),
    listMailboxes(c.env.DB),
    buildSnapshot(c.env, verified.userId)
  ]);
  return c.json({
    accessToken,
    subject: verified.userId,
    username: input.username,
    allowedFrom: mailboxes.filter((mailbox) => mailbox.isActive).map((mailbox) => mailbox.address),
    snapshot
  });
});

mailBridgeRoutes.post("/submit", async (c) => {
  const userId = await requireMailSession(c.env, c.req.raw);
  if (!userId) {
    throw new AppError("MAIL_SESSION_INVALID", "Mail session is invalid or expired.", 401);
  }
  await submitMessage(c.env, userId, parseWith(submissionSchema, await readJson(c.req.raw)));
  return c.body(null, 204);
});

mailBridgeRoutes.post("/mutations", async (c) => {
  const userId = await requireMailSession(c.env, c.req.raw);
  if (!userId) {
    throw new AppError("MAIL_SESSION_INVALID", "Mail session is invalid or expired.", 401);
  }
  await applyMutation(c.env, userId, parseWith(mutationSchema, await readJson(c.req.raw)));
  return c.body(null, 204);
});

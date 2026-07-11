import { Hono } from "hono";

import { canSendMail } from "../../auth/permissions";
import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";

import { replyToMessage, sendNewMessage } from "./service";
import { replyMessageSchema, sendMessageSchema } from "./validation";

export const sendRoutes = new Hono<HonoApp>();

sendRoutes.post("/send", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  if (!canSendMail(authContext.user.role)) {
    throw new AppError("FORBIDDEN", "You do not have permission to send email.", 403);
  }

  const input = parseWith(sendMessageSchema, await readJson(c.req.raw));
  return c.json(await sendNewMessage(c.env, input), 201);
});

sendRoutes.post("/reply", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  if (!canSendMail(authContext.user.role)) {
    throw new AppError("FORBIDDEN", "You do not have permission to send email.", 403);
  }

  const input = parseWith(replyMessageSchema, await readJson(c.req.raw));
  return c.json(await replyToMessage(c.env, input), 201);
});

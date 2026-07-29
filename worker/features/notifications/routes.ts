import { Hono } from "hono";
import { z } from "zod";

import { accessibleMailboxIds } from "../../auth/mailbox-access";
import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { parseWith } from "../../lib/validation";
import {
  countUnreadMessages,
  latestInboundMessageId,
  removePushSubscription,
  savePushSubscription
} from "./queries";

export const notificationRoutes = new Hono<HonoApp>();

const base64UrlSchema = z
  .string()
  .min(16)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);
const endpointSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => value.startsWith("https://"), {
    message: "Push subscription endpoints must use HTTPS."
  });
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  expirationTime: z.number().int().nonnegative().nullable(),
  keys: z.object({
    auth: base64UrlSchema,
    p256dh: base64UrlSchema
  })
});
const unsubscribeSchema = z.object({ endpoint: endpointSchema });

notificationRoutes.get("/status", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const mailboxIds = await accessibleMailboxIds(c.env.DB, auth.user.id, auth.user.role, "read");
  const [unread, latestMessageId] = await Promise.all([
    countUnreadMessages(c.env.DB, mailboxIds),
    latestInboundMessageId(c.env.DB, mailboxIds)
  ]);
  return c.json({
    latestInboundMessageId: latestMessageId,
    unread,
    vapidPublicKey: configuredPublicKey(c.env)
  });
});

notificationRoutes.put("/subscription", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  if (!configuredPublicKey(c.env) || !c.env.VAPID_PRIVATE_KEY) {
    throw new AppError(
      "PUSH_NOT_CONFIGURED",
      "Push notifications are not configured for this HQBase installation.",
      503
    );
  }
  const subscription = parseWith(subscriptionSchema, await c.req.json<unknown>().catch(() => ({})));
  await savePushSubscription(c.env.DB, auth.user.id, subscription);
  return c.json({ ok: true });
});

notificationRoutes.delete("/subscription", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const { endpoint } = parseWith(unsubscribeSchema, await c.req.json<unknown>().catch(() => ({})));
  await removePushSubscription(c.env.DB, auth.user.id, endpoint);
  return c.json({ ok: true });
});

function configuredPublicKey(env: HonoApp["Bindings"]): string | null {
  return env.VAPID_PUBLIC_KEY?.trim() || null;
}

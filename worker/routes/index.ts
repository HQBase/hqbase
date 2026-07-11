import { Hono } from "hono";

import { createAuth } from "../auth/auth";
import { appPasswordRoutes } from "../features/app-passwords/routes";
import { auditRoutes } from "../features/audit/routes";
import { requireConfigurationEntitlement } from "../features/billing/guard";
import { billingRoutes } from "../features/billing/routes";
import { domainRoutes } from "../features/domains/routes";
import { draftRoutes } from "../features/drafts/routes";
import { mailBridgeV2Routes } from "../features/mail-bridge/routes-v2";
import { mailboxAccessRoutes } from "../features/mailbox-access/routes";
import { mailboxRoutes } from "../features/mailboxes/routes";
import { attachmentRoutes, messageRoutes } from "../features/messages/routes";
import { operationRoutes } from "../features/operations/routes";
import { sendRoutes } from "../features/send/routes";
import { sessionControlRoutes } from "../features/sessions/routes";
import { setupRoutes } from "../features/setup/routes";
import { userRoutes } from "../features/users/routes";
import type { HonoApp } from "../lib/env";
import { errorBody, toAppError } from "../lib/errors";
import { jsonResponse } from "../lib/json";
import { enforceRateLimit } from "../security/rate-limit";

import { healthRoutes } from "./health";
import { meRoutes } from "./me";

export const apiRoutes = new Hono<HonoApp>();

apiRoutes.use("*", async (c, next) => {
  const provided = c.req.header("x-request-id") ?? "";
  const correlationId = /^[A-Za-z0-9_-]{8,100}$/.test(provided) ? provided : crypto.randomUUID();
  c.set("correlationId", correlationId);
  await next();
  c.header("x-request-id", correlationId);
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "no-referrer");
  c.header("cache-control", "no-store");
});

apiRoutes.onError((error, _c) => {
  const appError = toAppError(error);
  return jsonResponse(errorBody(appError.code, appError.message), { status: appError.status });
});

apiRoutes.notFound((c) => {
  return c.json(errorBody("NOT_FOUND", "Route not found."), 404);
});

apiRoutes.route("/api/health", healthRoutes);
apiRoutes.route("/api/setup", setupRoutes);
apiRoutes.route("/api/me", meRoutes);
apiRoutes.route("/api/pro/billing", billingRoutes);
apiRoutes.use("/api/pro/app-passwords", requireConfigurationEntitlement);
apiRoutes.use("/api/pro/app-passwords/*", requireConfigurationEntitlement);
apiRoutes.use("/api/pro/domains", requireConfigurationEntitlement);
apiRoutes.use("/api/pro/domains/*", requireConfigurationEntitlement);
apiRoutes.use("/api/pro/mailbox-grants", requireConfigurationEntitlement);
apiRoutes.use("/api/pro/mailbox-grants/*", requireConfigurationEntitlement);
apiRoutes.use("/api/users", requireConfigurationEntitlement);
apiRoutes.use("/api/users/*", requireConfigurationEntitlement);
apiRoutes.use("/api/mailboxes", requireConfigurationEntitlement);
apiRoutes.use("/api/mailboxes/*", requireConfigurationEntitlement);
apiRoutes.route("/api/pro/app-passwords", appPasswordRoutes);
apiRoutes.route("/api/pro/audit", auditRoutes);
apiRoutes.route("/api/pro/domains", domainRoutes);
apiRoutes.route("/api/pro/drafts", draftRoutes);
apiRoutes.route("/api/pro/mailbox-grants", mailboxAccessRoutes);
apiRoutes.route("/api/pro/mail-bridge/v2", mailBridgeV2Routes);
apiRoutes.route("/api/pro/sessions", sessionControlRoutes);
apiRoutes.route("/api/pro/operations", operationRoutes);
apiRoutes.route("/api/mailboxes", mailboxRoutes);
apiRoutes.route("/api/messages", messageRoutes);
apiRoutes.route("/api/attachments", attachmentRoutes);
apiRoutes.route("/api/users", userRoutes);
apiRoutes.route("/api", sendRoutes);

apiRoutes.all("/api/auth/*", async (c) => {
  const pathname = new URL(c.req.raw.url).pathname;
  if (pathname === "/api/auth/sign-up/email") {
    return c.json(
      errorBody("SIGNUP_DISABLED", "Public signup is disabled. Use setup or admin user creation."),
      403
    );
  }

  if (pathname === "/api/auth/sign-in/email" && c.req.method === "POST") {
    const body: { email?: unknown } = await c.req.raw
      .clone()
      .json<{ email?: unknown }>()
      .catch(() => ({}));
    const email = typeof body.email === "string" ? body.email : "invalid";
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    await Promise.all([
      enforceRateLimit(c.env.DB, c.env.PRO_SESSION_SECRET, {
        scope: "auth.email",
        subject: email,
        limit: 10,
        windowSeconds: 15 * 60
      }),
      enforceRateLimit(c.env.DB, c.env.PRO_SESSION_SECRET, {
        scope: "auth.ip",
        subject: ip,
        limit: 60,
        windowSeconds: 15 * 60
      })
    ]);
  }

  return createAuth(c.env, c.req.raw).handler(c.req.raw);
});

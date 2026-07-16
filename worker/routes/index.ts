import { Hono } from "hono";

import { createAuth } from "../auth/auth";
import { mailboxRoutes } from "../features/mailboxes/routes";
import { attachmentRoutes, messageRoutes } from "../features/messages/routes";
import { sendRoutes } from "../features/send/routes";
import { setupRoutes } from "../features/setup/routes";
import { updateRoutes } from "../features/updates/routes";
import { proUpgradeRoutes } from "../features/upgrades/routes";
import { enforceUpgradeWritePause } from "../features/upgrades/write-pause";
import { userRoutes } from "../features/users/routes";
import type { HonoApp } from "../lib/env";
import { errorBody, toAppError } from "../lib/errors";
import { jsonResponse } from "../lib/json";

import { healthRoutes } from "./health";
import { meRoutes } from "./me";

export const apiRoutes = new Hono<HonoApp>();

apiRoutes.use("*", enforceUpgradeWritePause);

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
apiRoutes.route("/api/mailboxes", mailboxRoutes);
apiRoutes.route("/api/messages", messageRoutes);
apiRoutes.route("/api/attachments", attachmentRoutes);
apiRoutes.route("/api/users", userRoutes);
apiRoutes.route("/api/updates", updateRoutes);
apiRoutes.route("/api/upgrades/pro", proUpgradeRoutes);
apiRoutes.route("/api", sendRoutes);

apiRoutes.all("/api/auth/*", async (c) => {
  const pathname = new URL(c.req.raw.url).pathname;
  if (pathname === "/api/auth/sign-up/email") {
    return c.json(
      errorBody("SIGNUP_DISABLED", "Public signup is disabled. Use setup or admin user creation."),
      403
    );
  }

  return createAuth(c.env, c.req.raw).handler(c.req.raw);
});

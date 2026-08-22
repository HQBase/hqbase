import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import {
  isRecentSession,
  requireAuthContext,
  requireRecentSession,
  requireRole
} from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { errorBody, toAppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { operationalLog } from "../../observability/log";
import {
  clearRuntimeCloudflareGrantCookie,
  finishRuntimeCloudflareOAuth,
  recentAuthenticationRedirect,
  resolveRuntimeCloudflareGrant,
  revokeRuntimeCloudflareGrant,
  startRuntimeCloudflareOAuth
} from "../cloudflare/oauth";
import { getUpdateStatus, triggerUpdate } from "./service";

export const updateRoutes = new Hono<HonoApp>();
const updateOAuthFlow = {
  callbackPath: "/api/updates/cloudflare/oauth/callback",
  operation: "updates",
  settingsTab: "updates"
} as const;
const applyUpdateSchema = z.object({
  expectedVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
});
updateRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json(await getUpdateStatus(c.env));
});
updateRoutes.get("/cloudflare/oauth/start", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  if (!isRecentSession(auth)) {
    return recentAuthenticationRedirect(c.req.raw, "updates");
  }
  return startRuntimeCloudflareOAuth(c.req.raw, c.env, updateOAuthFlow);
});
updateRoutes.get("/cloudflare/oauth/callback", async (c) => {
  return finishRuntimeCloudflareOAuth(c.req.raw, c.env, updateOAuthFlow);
});
updateRoutes.post("/apply", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  requireRecentSession(auth);
  const input = parseWith(applyUpdateSchema, await readJson(c.req.raw));
  const grant = await resolveRuntimeCloudflareGrant(c.req.raw, c.env);
  const outcome = await triggerUpdate(c.env, grant, input.expectedVersion).then(
    (result) => ({ ok: true, result }) as const,
    (error: unknown) => ({ error, ok: false }) as const
  );
  try {
    await revokeRuntimeCloudflareGrant(grant, c.env);
  } catch (error) {
    operationalLog("warn", "cloudflare_grant_revocation_failed", {
      errorCode: toAppError(error).code
    });
  } finally {
    c.header("set-cookie", clearRuntimeCloudflareGrantCookie());
  }
  if (!outcome.ok) {
    const appError = toAppError(outcome.error);
    return c.json(
      errorBody(appError.code, appError.message),
      appError.status as ContentfulStatusCode
    );
  }
  return c.json(outcome.result, 202);
});

import { Hono } from "hono";
import {
  isRecentSession,
  requireAuthContext,
  requireRecentSession,
  requireRole
} from "../../auth/session";
import type { HonoApp } from "../../lib/env";
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
  const grant = await resolveRuntimeCloudflareGrant(c.req.raw, c.env);
  const result = await triggerUpdate(c.env, grant);
  await revokeRuntimeCloudflareGrant(grant, c.env);
  c.header("set-cookie", clearRuntimeCloudflareGrantCookie());
  return c.json(result, 202);
});

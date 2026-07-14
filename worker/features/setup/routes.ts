import { Hono } from "hono";

import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";

import {
  configureCloudflareDomain,
  inspectCloudflareDomain,
  listCloudflareZones,
  verifyCloudflareToken
} from "./cloudflare";
import {
  clearCloudflareGrantCookie,
  finishCloudflareOAuth,
  getCloudflareOAuthStatus,
  resolveCloudflareAccess,
  revokeCloudflareGrant,
  startCloudflareOAuth
} from "./cloudflare-oauth";
import { getSetupStatus } from "./queries";
import { bootstrapSetup } from "./service";
import {
  bootstrapSetupSchema,
  configureCloudflareDomainSchema,
  inspectCloudflareDomainSchema,
  listCloudflareZonesSchema,
  verifyCloudflareTokenSchema
} from "./validation";

export const setupRoutes = new Hono<HonoApp>();

setupRoutes.get("/status", async (c) => {
  return c.json(await getSetupStatus(c.env.DB));
});

setupRoutes.get("/cloudflare/oauth/start", async (c) => {
  return startCloudflareOAuth(c.req.raw, c.env);
});

setupRoutes.post("/cloudflare/oauth/start", async (c) => {
  return startCloudflareOAuth(c.req.raw, c.env);
});

setupRoutes.get("/cloudflare/oauth/callback", async (c) => {
  return finishCloudflareOAuth(c.req.raw, c.env);
});

setupRoutes.get("/cloudflare/oauth/status", async (c) => {
  c.header("cache-control", "no-store");
  return c.json(await getCloudflareOAuthStatus(c.req.raw, c.env));
});

setupRoutes.post("/cloudflare/zones", async (c) => {
  const input = parseWith(listCloudflareZonesSchema, await readJson(c.req.raw));
  const access = await resolveCloudflareAccess(c.req.raw, c.env, input.apiToken);
  return c.json({ zones: await listCloudflareZones({ apiToken: access.apiToken }) });
});

setupRoutes.post("/cloudflare/token", async (c) => {
  const input = parseWith(verifyCloudflareTokenSchema, await readJson(c.req.raw));
  return c.json(await verifyCloudflareToken(input));
});

setupRoutes.post("/cloudflare/inspect", async (c) => {
  const input = parseWith(inspectCloudflareDomainSchema, await readJson(c.req.raw));
  const access = await resolveCloudflareAccess(c.req.raw, c.env, input.apiToken);
  return c.json(
    await inspectCloudflareDomain({
      ...input,
      apiToken: access.apiToken,
      workerName: c.env.HQBASE_WORKER_NAME ?? input.workerName
    })
  );
});

setupRoutes.post("/cloudflare/configure", async (c) => {
  const input = parseWith(configureCloudflareDomainSchema, await readJson(c.req.raw));
  const access = await resolveCloudflareAccess(c.req.raw, c.env, input.apiToken);
  const result = await configureCloudflareDomain({
    ...input,
    apiToken: access.apiToken,
    workerName: c.env.HQBASE_WORKER_NAME ?? input.workerName
  });
  const customDomainSucceeded = result.steps.some(
    (step) => step.id === "custom-domain" && step.status === "success"
  );
  if (access.source === "oauth" && result.status.ready && customDomainSucceeded) {
    await revokeCloudflareGrant(access.apiToken, c.env);
    c.header("set-cookie", clearCloudflareGrantCookie());
  }
  return c.json(result);
});

setupRoutes.post("/bootstrap", async (c) => {
  const input = parseWith(bootstrapSetupSchema, await readJson(c.req.raw));
  const result = await bootstrapSetup(c.env, c.req.raw, input);
  return c.json(result, 201);
});

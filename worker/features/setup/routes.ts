import { Hono } from "hono";
import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import {
  clearRuntimeCloudflareGrantCookie,
  finishRuntimeCloudflareOAuth,
  resolveRuntimeCloudflareGrant,
  revokeRuntimeCloudflareGrant,
  startRuntimeCloudflareOAuth
} from "../cloudflare/oauth";

import {
  configureCloudflareDomain,
  inspectCloudflareDomain,
  listCloudflareZones,
  verifyCloudflareToken
} from "./cloudflare";
import { getSetupStatus } from "./queries";
import { bootstrapSetup } from "./service";
import {
  bootstrapSetupSchema,
  configureCloudflareDomainSchema,
  inspectCloudflareDomainSchema,
  listCloudflareZonesSchema,
  verifyCloudflareAccessSchema
} from "./validation";

export const setupRoutes = new Hono<HonoApp>();
const setupOAuthFlow = {
  callbackPath: "/api/setup/cloudflare/oauth/callback",
  operation: "setup",
  returnPath: "/setup"
} as const;

setupRoutes.get("/status", async (c) => {
  return c.json(await getSetupStatus(c.env.DB));
});

setupRoutes.get("/cloudflare/oauth/start", async (c) => {
  return startRuntimeCloudflareOAuth(c.req.raw, c.env, setupOAuthFlow);
});

setupRoutes.get("/cloudflare/oauth/callback", async (c) => {
  return finishRuntimeCloudflareOAuth(c.req.raw, c.env, setupOAuthFlow);
});

setupRoutes.post("/cloudflare/zones", async (c) => {
  const input = parseWith(listCloudflareZonesSchema, await readJson(c.req.raw));
  return c.json({
    zones: await listCloudflareZones({
      ...input,
      apiToken: await resolveRuntimeCloudflareGrant(c.req.raw, c.env)
    })
  });
});

setupRoutes.post("/cloudflare/access", async (c) => {
  const input = parseWith(verifyCloudflareAccessSchema, await readJson(c.req.raw));
  return c.json(
    await verifyCloudflareToken({
      ...input,
      apiToken: await resolveRuntimeCloudflareGrant(c.req.raw, c.env)
    })
  );
});

setupRoutes.post("/cloudflare/inspect", async (c) => {
  const input = parseWith(inspectCloudflareDomainSchema, await readJson(c.req.raw));
  return c.json(
    await inspectCloudflareDomain({
      ...input,
      apiToken: await resolveRuntimeCloudflareGrant(c.req.raw, c.env),
      workerName: c.env.HQBASE_WORKER_NAME ?? input.workerName
    })
  );
});

setupRoutes.post("/cloudflare/configure", async (c) => {
  const input = parseWith(configureCloudflareDomainSchema, await readJson(c.req.raw));
  return c.json(
    await configureCloudflareDomain({
      ...input,
      apiToken: await resolveRuntimeCloudflareGrant(c.req.raw, c.env),
      workerName: c.env.HQBASE_WORKER_NAME ?? input.workerName
    })
  );
});

setupRoutes.post("/bootstrap", async (c) => {
  const input = parseWith(bootstrapSetupSchema, await readJson(c.req.raw));
  const grant = await resolveRuntimeCloudflareGrant(c.req.raw, c.env);
  const result = await bootstrapSetup(c.env, c.req.raw, input);
  c.executionCtx.waitUntil(revokeRuntimeCloudflareGrant(grant, c.env).catch(() => undefined));
  c.header("set-cookie", clearRuntimeCloudflareGrantCookie());
  return c.json(result, 201);
});

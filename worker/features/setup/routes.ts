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
import { revokeSetupGrant } from "./oauth-cleanup";
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

setupRoutes.post("/cloudflare/zones", async (c) => {
  const input = parseWith(listCloudflareZonesSchema, await readJson(c.req.raw));
  return c.json({
    zones: await listCloudflareZones({ ...input, apiToken: setupToken(c.env, input.apiToken) })
  });
});

setupRoutes.post("/cloudflare/token", async (c) => {
  const input = parseWith(verifyCloudflareTokenSchema, await readJson(c.req.raw));
  return c.json(
    await verifyCloudflareToken({ ...input, apiToken: setupToken(c.env, input.apiToken) })
  );
});

setupRoutes.post("/cloudflare/inspect", async (c) => {
  const input = parseWith(inspectCloudflareDomainSchema, await readJson(c.req.raw));
  return c.json(
    await inspectCloudflareDomain({
      ...input,
      apiToken: setupToken(c.env, input.apiToken),
      workerName: c.env.HQBASE_WORKER_NAME ?? input.workerName
    })
  );
});

setupRoutes.post("/cloudflare/configure", async (c) => {
  const input = parseWith(configureCloudflareDomainSchema, await readJson(c.req.raw));
  return c.json(
    await configureCloudflareDomain({
      ...input,
      apiToken: setupToken(c.env, input.apiToken),
      workerName: c.env.HQBASE_WORKER_NAME ?? input.workerName
    })
  );
});

setupRoutes.post("/bootstrap", async (c) => {
  const input = parseWith(bootstrapSetupSchema, await readJson(c.req.raw));
  const result = await bootstrapSetup(c.env, c.req.raw, input);
  c.executionCtx.waitUntil(
    revokeSetupGrant(c.env, result.setup.domains[0]?.accountId).catch(() => undefined)
  );
  return c.json(result, 201);
});

function setupToken(env: HonoApp["Bindings"], apiToken?: string): string {
  const value = apiToken ?? env.HQBASE_SETUP_OAUTH_ACCESS_TOKEN;
  if (!value) {
    throw new Error(
      "The Cloudflare setup authorization expired. Restart Pro installation to authorize again."
    );
  }
  return value;
}

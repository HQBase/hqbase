import { Hono } from "hono";
import {
  isRecentSession,
  requireAuthContext,
  requireRecentSession,
  requireRole
} from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError, toAppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { operationalLog } from "../../observability/log";
import { assertDomainUnusedByLoginEmails } from "../../security/login-email";
import { recordAudit } from "../audit/service";
import {
  clearRuntimeCloudflareGrantCookie,
  finishRuntimeCloudflareOAuth,
  recentAuthenticationRedirect,
  resolveRuntimeCloudflareGrant,
  revokeRuntimeCloudflareGrant,
  startRuntimeCloudflareOAuth
} from "../cloudflare/oauth";
import {
  attachWorkerCustomDomain,
  configureCloudflareDomain,
  disconnectCloudflareDomain,
  inspectCloudflareDomain,
  listCloudflareZones
} from "../setup/cloudflare";
import { upsertWorkspaceHost } from "../setup/queries";
import { disconnectMailDomain, forgetMailDomain } from "./lifecycle-service";
import {
  findMailDomainById,
  findMailDomainByName,
  listMailDomains,
  updateMailDomainReadiness,
  updateMailDomainSettings,
  upsertMailDomain
} from "./queries";
import { readinessSnapshot } from "./readiness";
import {
  changePortalHostnameSchema,
  createMailDomainSchema,
  forgetMailDomainSchema,
  provisionMailDomainSchema,
  updateMailDomainSchema
} from "./validation";

export const domainRoutes = new Hono<HonoApp>();

const domainOAuthFlow = {
  callbackPath: "/api/domains/cloudflare/oauth/callback",
  operation: "domains",
  settingsTab: "domains"
} as const;
domainRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json(await listMailDomains(c.env.DB));
});

domainRoutes.get("/cloudflare/oauth/start", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  if (!isRecentSession(auth)) {
    return recentAuthenticationRedirect(c.req.raw, "domains");
  }
  return startRuntimeCloudflareOAuth(c.req.raw, c.env, domainOAuthFlow);
});

domainRoutes.get("/cloudflare/oauth/callback", async (c) => {
  return finishRuntimeCloudflareOAuth(c.req.raw, c.env, domainOAuthFlow);
});

domainRoutes.get("/cloudflare/zones", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const grant = await resolveRuntimeCloudflareGrant(c.req.raw, c.env);
  return c.json({ zones: await listCloudflareZones({ apiToken: grant }) });
});

domainRoutes.post("/cloudflare/revoke", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const grant = await resolveRuntimeCloudflareGrant(c.req.raw, c.env);
  await revokeRuntimeCloudflareGrant(grant, c.env);
  c.header("set-cookie", clearRuntimeCloudflareGrantCookie());
  return c.json({ revoked: true });
});

domainRoutes.post("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const input = parseWith(createMailDomainSchema, await readJson(c.req.raw));
  const current = await findMailDomainByName(c.env.DB, input.name);
  if (current?.disconnectedAt) {
    throw new AppError(
      "DOMAIN_DISCONNECTED",
      "Reconnect this domain through Cloudflare before using it again.",
      409
    );
  }
  const domain = await upsertMailDomain(c.env.DB, input);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "domain.upsert",
    resourceType: "domain",
    resourceId: domain.id,
    outcome: "success"
  });
  return c.json(domain, 201);
});

domainRoutes.post("/provision", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  requireRecentSession(auth);
  const input = parseWith(provisionMailDomainSchema, await readJson(c.req.raw));
  const current = await findMailDomainByName(c.env.DB, input.name);
  if (!current) {
    await assertDomainUnusedByLoginEmails(c.env.DB, input.name);
  }
  const grant = await resolveRuntimeCloudflareGrant(c.req.raw, c.env);
  const result = await configureCloudflareDomain({
    apiToken: grant,
    zoneId: input.zoneId,
    workerName: c.env.HQBASE_WORKER_NAME ?? input.workerName,
    attachCustomDomain: false,
    enableSending: input.enableSending
  });
  const domain = await upsertMailDomain(c.env.DB, {
    name: input.name,
    zoneId: result.status.zone.id,
    accountId: result.status.zone.accountId,
    ...readinessSnapshot(result.status)
  });
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: current?.disconnectedAt ? "domain.reconnect" : "domain.provision",
    resourceType: "domain",
    resourceId: domain.id,
    outcome: result.status.ready ? "success" : "failure"
  });
  await revokeRuntimeCloudflareGrant(grant, c.env);
  c.header("set-cookie", clearRuntimeCloudflareGrantCookie());
  return c.json({ domain, steps: result.steps }, result.status.ready ? 200 : 207);
});

domainRoutes.put("/portal", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  requireRecentSession(auth);
  const input = parseWith(changePortalHostnameSchema, await readJson(c.req.raw));
  const grant = await resolveRuntimeCloudflareGrant(c.req.raw, c.env);
  const inspected = await inspectCloudflareDomain({
    apiToken: grant,
    workerName: c.env.HQBASE_WORKER_NAME ?? input.workerName,
    zoneId: input.zoneId
  });
  await attachWorkerCustomDomain({
    apiToken: grant,
    hostname: input.hostname,
    workerName: inspected.workerName,
    zone: inspected.zone
  });
  await upsertWorkspaceHost(c.env.DB, {
    hostname: input.hostname,
    zoneId: input.zoneId,
    kind: "portal",
    canonical: true
  });
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "portal.cutover",
    resourceType: "workspace_host",
    resourceId: input.hostname,
    outcome: "success"
  });
  await revokeRuntimeCloudflareGrant(grant, c.env);
  c.header("set-cookie", clearRuntimeCloudflareGrantCookie());
  return c.json({ hostname: input.hostname, canonical: true });
});

domainRoutes.post("/:id/recheck", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  requireRecentSession(auth);
  const current = await findMailDomainById(c.env.DB, c.req.param("id"));
  if (!current) throw new AppError("DOMAIN_NOT_FOUND", "Email domain not found.", 404);
  if (current.disconnectedAt) {
    throw new AppError(
      "DOMAIN_DISCONNECTED",
      "Reconnect this domain before checking readiness.",
      409
    );
  }
  if (!current.zoneId) {
    throw new AppError(
      "DOMAIN_ZONE_REQUIRED",
      "Connect this domain to a Cloudflare zone before checking readiness.",
      409
    );
  }

  const grant = await resolveRuntimeCloudflareGrant(c.req.raw, c.env);
  const outcome = await inspectCloudflareDomain({
    apiToken: grant,
    workerName: c.env.HQBASE_WORKER_NAME,
    zoneId: current.zoneId
  }).then(
    (status) => ({ ok: true, status }) as const,
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
    await recordAudit(c.env.DB, {
      correlationId: c.get("correlationId"),
      actorType: "user",
      actorId: auth.user.id,
      action: "domain.recheck",
      resourceType: "domain",
      resourceId: current.id,
      outcome: "failure",
      metadata: { errorCode: appError.code }
    });
    throw appError;
  }
  if (outcome.status.zone.name !== current.name) {
    await recordAudit(c.env.DB, {
      correlationId: c.get("correlationId"),
      actorType: "user",
      actorId: auth.user.id,
      action: "domain.recheck",
      resourceType: "domain",
      resourceId: current.id,
      outcome: "failure",
      metadata: { errorCode: "DOMAIN_ZONE_MISMATCH" }
    });
    throw new AppError(
      "DOMAIN_ZONE_MISMATCH",
      "Cloudflare returned a different domain for the stored zone.",
      409
    );
  }

  const domain = await updateMailDomainReadiness(c.env.DB, current.id, {
    accountId: outcome.status.zone.accountId,
    zoneId: outcome.status.zone.id,
    ...readinessSnapshot(outcome.status)
  });
  if (!domain) throw new AppError("DOMAIN_NOT_FOUND", "Email domain not found.", 404);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "domain.recheck",
    resourceType: "domain",
    resourceId: domain.id,
    outcome: "success",
    metadata: {
      dnsStatus: domain.dnsStatus,
      receivingStatus: domain.receivingStatus,
      sendingStatus: domain.sendingStatus
    }
  });
  return c.json(domain);
});

domainRoutes.post("/:id/disconnect", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  requireRecentSession(auth);
  const current = await findMailDomainById(c.env.DB, c.req.param("id"));
  if (!current) throw new AppError("DOMAIN_NOT_FOUND", "Email domain not found.", 404);
  if (current.disconnectedAt) return c.json(current);
  if (!current.zoneId) {
    throw new AppError(
      "DOMAIN_ZONE_REQUIRED",
      "Connect this domain to a Cloudflare zone before disconnecting it.",
      409
    );
  }

  const grant = await resolveRuntimeCloudflareGrant(c.req.raw, c.env);
  const outcome = await disconnectCloudflareDomain({
    apiToken: grant,
    domainName: current.name,
    workerName: c.env.HQBASE_WORKER_NAME,
    zoneId: current.zoneId
  }).then(
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
    await recordAudit(c.env.DB, {
      correlationId: c.get("correlationId"),
      actorType: "user",
      actorId: auth.user.id,
      action: "domain.disconnect",
      resourceType: "domain",
      resourceId: current.id,
      outcome: "failure",
      metadata: { errorCode: appError.code }
    });
    throw appError;
  }

  return c.json(
    await disconnectMailDomain(c.env.DB, current.id, {
      correlationId: c.get("correlationId"),
      actorType: "user",
      actorId: auth.user.id,
      action: "domain.disconnect",
      resourceType: "domain",
      resourceId: current.id,
      outcome: "success",
      metadata: { catchAllChanged: outcome.result.catchAllChanged }
    })
  );
});

domainRoutes.delete("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const input = parseWith(forgetMailDomainSchema, await readJson(c.req.raw));
  try {
    await forgetMailDomain(c.env.DB, c.req.param("id"), input.confirmation, {
      correlationId: c.get("correlationId"),
      actorType: "user",
      actorId: auth.user.id,
      action: "domain.forget",
      resourceType: "domain",
      resourceId: c.req.param("id"),
      outcome: "success"
    });
  } catch (error) {
    const appError = toAppError(error);
    await recordAudit(c.env.DB, {
      correlationId: c.get("correlationId"),
      actorType: "user",
      actorId: auth.user.id,
      action: "domain.forget",
      resourceType: "domain",
      resourceId: c.req.param("id"),
      outcome: "failure",
      metadata: { errorCode: appError.code }
    });
    throw appError;
  }
  return c.body(null, 204);
});

domainRoutes.patch("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const domain = await updateMailDomainSettings(
    c.env.DB,
    c.req.param("id"),
    parseWith(updateMailDomainSchema, await readJson(c.req.raw))
  );
  if (!domain) throw new AppError("DOMAIN_NOT_FOUND", "Email domain not found.", 404);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "domain.update",
    resourceType: "domain",
    resourceId: domain.id,
    outcome: "success"
  });
  return c.json(domain);
});

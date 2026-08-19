import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { optionalBoolean, optionalString, requireString } from "./args.mjs";
import {
  assertAttachmentAllowed,
  createWorkerDomainsClient,
  planAttachment,
  requireCloudflareApiToken
} from "./cloudflare-domains.mjs";
import { run } from "./command.mjs";
import { writeWranglerConfig } from "./config.mjs";
import {
  assertResumable,
  domainChangeNotes,
  hostOf,
  stagedMoveRecord,
  updateDomainManifest
} from "./domain-plan.mjs";
import { configPath, loadManifest, writeManifest } from "./manifest.mjs";
import { rootDir } from "./paths.mjs";
import { prepareManifest, resolveCloudflareAccount } from "./resources.mjs";

const discoveryPath = "/api/v1/openapi.json";

/**
 * Move a deployment to a different canonical portal hostname without touching D1, R2, or queues.
 *
 * The workspace has one mutable canonical portal hostname and one stable machine-facing service
 * origin (BETTER_AUTH_URL: the auth issuer, the Mail API audience, and the MCP audience). A portal
 * move follows attach, verify, cutover, redirect, and it never moves the service origin unless the
 * operator asks for that explicitly.
 *
 *   pnpm hqbase domain --name dev-01 --app-domain app.example.com
 *   pnpm hqbase domain --name dev-01 --app-domain app.example.com --move-service-origin
 *   pnpm hqbase domain --name dev-01 --detach --auth-url https://mail.example.com --yes
 */
export async function configureDomain(flags, options = {}) {
  const name = requireString(flags, "name");
  const dryRun = optionalBoolean(flags, "dry-run");
  const skipDeploy = optionalBoolean(flags, "skip-deploy");
  const yes = optionalBoolean(flags, "yes");
  const environment = options.environment ?? process.env;
  const runCommand = options.runCommand ?? run;
  const checkpoint = options.checkpoint ?? writeManifest;
  const input = {
    appDomain: optionalString(flags, "app-domain"),
    authUrl: optionalString(flags, "auth-url"),
    detach: optionalBoolean(flags, "detach"),
    detachOld: optionalBoolean(flags, "detach-old"),
    keepServiceOrigin: optionalBoolean(flags, "keep-service-origin"),
    moveServiceOrigin: optionalBoolean(flags, "move-service-origin"),
    override: optionalBoolean(flags, "override-existing")
  };

  const committed = loadManifest(name);
  const proposed = updateDomainManifest(committed, input);

  if (dryRun) {
    reportPlan(name, committed, proposed, { dryRun: true });
    return proposed;
  }
  if ((input.detach || input.detachOld) && !yes) {
    throw new Error(
      "Removing a custom domain deletes its Cloudflare DNS record and requires --yes."
    );
  }

  const accountId = resolveCloudflareAccount(committed.accountId, { environment, runCommand });
  const verified = prepareManifest(committed, accountId, {
    allowDomainMove: true,
    checkpoint,
    runCommand
  });
  const target = { ...proposed, accountId: verified.accountId };
  assertResumable(verified, target);

  const domains =
    options.domains ??
    createWorkerDomainsClient({
      accountId: verified.accountId,
      token: requireCloudflareApiToken(environment)
    });
  const context = {
    checkpoint,
    committed: verified,
    deployConfiguration: options.deployConfiguration ?? defaultDeployConfiguration,
    domains,
    confirmed: yes,
    override: input.override,
    probe: options.probe ?? defaultProbe,
    retry: options.retry ?? { attempts: 10, delayMs: 3000 },
    runCommand,
    skipDeploy,
    target
  };

  const move = stageMove(verified, target, { checkpoint, detachOld: input.detachOld });
  try {
    if (target.appDomain) {
      await attachHost(context, move);
      await verifyHost(context, move);
    }
    await cutover(context, move);
    await redirect(context, move);
    await detachRetiredHosts(context, move);
    commitMove(context, move);
  } catch (error) {
    await rollback(context, move, error);
    throw error;
  }

  reportPlan(name, verified, target, { dryRun: false });
  return target;
}

function stageMove(manifest, target, options) {
  const move =
    manifest.domainMove ?? stagedMoveRecord(manifest, target, { detachOld: options.detachOld });
  manifest.domainMove = move;
  options.checkpoint(manifest);
  return move;
}

async function attachHost(context, move) {
  const { committed, domains, target } = context;
  const hostname = target.appDomain;
  const plan = planAttachment(await domains.list(), {
    hostname,
    service: committed.worker.name
  });
  assertAttachmentAllowed(plan, {
    hostname,
    confirmed: context.confirmed,
    override: context.override,
    service: committed.worker.name
  });
  if (plan.action === "keep") {
    move.attachedDomainId = plan.existing.id ?? null;
    move.state = "attached";
    context.checkpoint(committed);
    return;
  }

  const zone = await domains.findZone(hostname);
  if (!zone) {
    throw new Error(
      `Refusing to attach ${hostname}: no Cloudflare zone in account ${committed.accountId} serves it.`
    );
  }
  move.state = "attaching";
  context.checkpoint(committed);
  const attached = await domains.attach({
    hostname,
    service: committed.worker.name,
    zoneId: zone.id,
    zoneName: zone.name,
    override: context.override
  });
  move.attachedDomainId = attached?.id ?? null;
  move.attachedByThisRun = true;
  move.state = "attached";
  context.checkpoint(committed);
}

async function verifyHost(context, move) {
  const { committed, domains, target } = context;
  const hostname = target.appDomain;
  const attached = (await domains.list()).find((domain) => domain?.hostname === hostname);
  if (!attached || attached.service !== committed.worker.name) {
    throw new Error(
      `Refusing to continue: Cloudflare does not report ${hostname} as a custom domain of Worker "${committed.worker.name}".`
    );
  }
  await probeOrigin(context, `https://${hostname}`);
  move.state = "verified";
  context.checkpoint(committed);
}

async function cutover(context, move) {
  const { committed, target } = context;
  writeWranglerConfig(target);
  if (context.skipDeploy) {
    move.state = "cutover";
    context.checkpoint(committed);
    return;
  }
  // wrangler validates assets.directory even for a configuration deployment.
  fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
  context.deployConfiguration({
    accountId: committed.accountId,
    configFile: configPath(committed.name),
    runCommand: context.runCommand
  });
  move.deployed = true;
  move.state = "cutover";
  context.checkpoint(committed);

  const probeHost = target.appDomain ?? hostOf(target.authUrl);
  if (probeHost) {
    const advertised = await probeOrigin(context, `https://${probeHost}`);
    const expected = target.authUrl ?? `https://${probeHost}`;
    if (advertised !== expected) {
      throw new Error(
        `Refusing to continue: ${probeHost} advertises the service origin ${advertised}, not ${expected}. BETTER_AUTH_URL was not deployed.`
      );
    }
  }
}

async function redirect(context, move) {
  const { committed, target } = context;
  if (!target.appDomain || context.skipDeploy) {
    return;
  }
  const statements = [
    `INSERT INTO workspace_hosts (id, hostname, zone_id, kind, is_canonical, status, verified_at, created_at, updated_at) VALUES ('host_${randomUUID()}', '${target.appDomain}', NULL, 'portal', 0, 'ready', datetime('now'), datetime('now'), datetime('now')) ON CONFLICT(hostname) DO UPDATE SET status = 'ready', verified_at = datetime('now'), updated_at = datetime('now')`,
    "UPDATE workspace_hosts SET is_canonical = 0, updated_at = datetime('now') WHERE kind = 'portal'",
    `UPDATE workspace_hosts SET is_canonical = 1, updated_at = datetime('now') WHERE hostname = '${target.appDomain}'`
  ];
  context.runCommand(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      committed.d1.name,
      "--remote",
      "--yes",
      "--command",
      `${statements.join("; ")};`,
      "--config",
      configPath(committed.name)
    ],
    { env: { CLOUDFLARE_ACCOUNT_ID: committed.accountId } }
  );
  move.state = "redirected";
  context.checkpoint(committed);
}

async function detachRetiredHosts(context, move) {
  const { committed, domains, target } = context;
  const keep = new Set([target.appDomain, ...(target.retiredDomains ?? [])].filter(Boolean));
  const owned = new Set([committed.appDomain, ...(committed.retiredDomains ?? [])].filter(Boolean));
  const removable = (list) =>
    list.filter(
      (domain) =>
        domain?.service === committed.worker.name &&
        owned.has(domain.hostname) &&
        !keep.has(domain.hostname)
    );

  for (const domain of removable(await domains.list())) {
    await domains.remove(domain.id);
  }
  const stale = removable(await domains.list());
  if (stale.length > 0) {
    throw new Error(
      `Refusing to finish: Cloudflare still reports ${stale.map((domain) => domain.hostname).join(", ")} as a custom domain of Worker "${committed.worker.name}".`
    );
  }
  move.state = "detached";
  context.checkpoint(committed);
}

function commitMove(context, move) {
  const { committed, target } = context;
  move.state = "committed";
  const next = { ...committed, ...target };
  delete next.domainMove;
  context.checkpoint(next);
  writeWranglerConfig(next);
}

async function rollback(context, move, cause) {
  const { committed, domains, target } = context;
  console.error(`Domain move failed after step "${move.state}": ${cause.message}`);
  try {
    if (move.deployed) {
      writeWranglerConfig(committed);
      if (!context.skipDeploy) {
        context.deployConfiguration({
          accountId: committed.accountId,
          configFile: configPath(committed.name),
          runCommand: context.runCommand
        });
      }
      move.deployed = false;
    }
    if (move.attachedByThisRun && move.attachedDomainId && !context.override) {
      await domains.remove(move.attachedDomainId);
      move.attachedByThisRun = false;
      move.attachedDomainId = null;
    }
    move.state = "rolled-back";
  } catch (rollbackError) {
    console.error(`Rollback is incomplete: ${rollbackError.message}`);
  } finally {
    committed.domainMove = move;
    context.checkpoint(committed);
    writeWranglerConfig(committed);
    console.error(
      `The saved deployment record still describes ${committed.appDomain ?? "the default hostname"}. Re-run the same command to resume, or inspect Cloudflare and repair "${committed.name}".`
    );
    if (move.attachedByThisRun && move.attachedDomainId) {
      console.error(
        `Custom domain recovery: DELETE /accounts/${committed.accountId}/workers/domains/${move.attachedDomainId} removes ${target.appDomain}.`
      );
    }
  }
}

async function probeOrigin(context, origin) {
  const { attempts, delayMs } = context.retry;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const advertised = await context.probe(`${origin}${discoveryPath}`);
      if (typeof advertised === "string" && advertised) {
        return advertised.replace(/\/$/, "");
      }
      lastError = new Error("the installation did not advertise a service origin");
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `Refusing to continue: ${origin} did not serve a healthy HQBase installation (${lastError?.message ?? "no response"}). DNS or the certificate is not ready.`
  );
}

async function defaultProbe(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const document = await response.json();
  return document?.servers?.[0]?.url;
}

function defaultDeployConfiguration({ accountId, configFile, runCommand }) {
  runCommand(
    "node",
    ["scripts/release/deploy.mjs", "--config", configFile, "--configuration-only"],
    { env: { CLOUDFLARE_ACCOUNT_ID: accountId } }
  );
}

function reportPlan(name, previous, next, options) {
  const target = next.appDomain
    ? `custom domain ${next.appDomain}`
    : "the default workers.dev hostname";
  console.log(
    options.dryRun
      ? `HQBase deployment "${name}" domain configuration is valid (${target}).`
      : `HQBase deployment "${name}" now serves from ${target}.`
  );
  for (const note of domainChangeNotes(previous, next)) {
    console.log(`  - ${note}`);
  }
}

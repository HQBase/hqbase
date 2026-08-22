import fs from "node:fs";
import path from "node:path";

import { optionalBoolean, optionalString, requireString } from "./args.mjs";
import {
  assertAttachmentAllowed,
  createWorkerDomainsClient,
  planAttachment,
  requireDomainApiToken
} from "./cloudflare-domains.mjs";
import { run } from "./command.mjs";
import { writeWranglerConfig } from "./config.mjs";
import {
  assertResumable,
  domainChangeNotes,
  hostOf,
  migrateStagedMoveRecord,
  stagedMoveRecord,
  updateDomainManifest
} from "./domain-plan.mjs";
import { assertManagedHosts, domainSnapshot, rollbackDomainMove } from "./domain-recovery.mjs";
import {
  createDomainProbe,
  probeServiceOrigin,
  readCanonicalPortal,
  setCanonicalPortal
} from "./domain-runtime.mjs";
import { configPath, loadManifest, writeManifest } from "./manifest.mjs";
import { rootDir } from "./paths.mjs";
import { prepareManifest, resolveCloudflareAccount } from "./resources.mjs";

/**
 * Move a deployment to a different canonical portal hostname without changing mail data or the
 * identities of its D1, R2, and queue resources.
 *
 * The workspace has one mutable canonical portal hostname and one stable machine-facing service
 * origin (BETTER_AUTH_URL: the auth issuer, the Mail API audience, and the MCP audience). A portal
 * move follows attach, verify, cutover, redirect, and it never moves the service origin unless the
 * operator asks for that explicitly.
 *
 *   pnpm hqbase domain --name dev-01 --app-domain app.example.com
 *   pnpm hqbase domain --name dev-01 --app-domain app.example.com --move-service-origin
 *   pnpm hqbase domain --name dev-01 --detach --move-service-origin --yes
 */
export async function configureDomain(flags, options = {}) {
  const name = requireString(flags, "name");
  const dryRun = optionalBoolean(flags, "dry-run");
  const yes = optionalBoolean(flags, "yes");
  if (flags["skip-deploy"] !== undefined) {
    throw new Error("--skip-deploy is not supported because a partial domain move is unsafe.");
  }
  if (flags["override-existing"] !== undefined) {
    throw new Error(
      "--override-existing is not supported. Move or remove the conflicting hostname in Cloudflare before retrying."
    );
  }
  const environment = options.environment ?? process.env;
  const runCommand = options.runCommand ?? run;
  const checkpoint = options.checkpoint ?? writeManifest;
  const input = {
    appDomain: optionalString(flags, "app-domain"),
    authUrl: optionalString(flags, "auth-url"),
    detach: optionalBoolean(flags, "detach"),
    detachOld: optionalBoolean(flags, "detach-old"),
    keepServiceOrigin: optionalBoolean(flags, "keep-service-origin"),
    moveServiceOrigin: optionalBoolean(flags, "move-service-origin")
  };

  const loaded = loadManifest(name);

  if (dryRun) {
    const proposed = updateDomainManifest(loaded, input);
    reportPlan(name, loaded, proposed, { dryRun: true });
    return proposed;
  }
  if ((input.detach || input.detachOld) && !yes) {
    throw new Error(
      "Removing a custom domain deletes its Cloudflare DNS record and requires --yes."
    );
  }

  const domainApiToken = options.domains ? null : requireDomainApiToken(environment);
  const accountId = resolveCloudflareAccount(loaded.accountId, { environment, runCommand });
  const verified = prepareManifest(loaded, accountId, {
    allowDomainMove: true,
    checkpoint,
    runCommand
  });
  const proposed = updateDomainManifest(verified, input);
  const target = { ...proposed, accountId: verified.accountId };
  assertResumable(verified, target, { detachOld: input.detachOld });

  const domains =
    options.domains ??
    createWorkerDomainsClient({
      accountId: verified.accountId,
      token: domainApiToken
    });
  const context = {
    checkpoint,
    committed: verified,
    deployConfiguration: options.deployConfiguration ?? defaultDeployConfiguration,
    domains,
    probe: options.probe ?? createDomainProbe(environment),
    retry: options.retry ?? { attempts: 150, delayMs: 2000 },
    runCommand,
    setCanonicalPortal: options.setCanonicalPortal ?? setCanonicalPortal,
    readCanonicalPortal: options.readCanonicalPortal ?? readCanonicalPortal,
    target
  };

  if (!verified.domainMove) {
    await assertManagedHosts(context);
    const canonical = await context.readCanonicalPortal({
      manifest: verified,
      runCommand: context.runCommand
    });
    if (canonical !== (verified.appDomain ?? null)) {
      throw new Error(
        `Refusing to continue: D1 reports ${canonical ?? "no canonical portal"}, not the saved hostname ${verified.appDomain ?? "none"}.`
      );
    }
  }
  const move = stageMove(verified, target, { checkpoint, detachOld: input.detachOld });
  try {
    if (target.appDomain) {
      await attachHost(context, move);
      await verifyHost(context, move);
    }
    await cutover(context, move);
    await redirect(context, move);
    await detachRetiredHosts(context, move);
    await assertManagedHosts(context, target);
    commitMove(context, move);
  } catch (error) {
    await rollbackDomainMove(context, move, error);
    throw error;
  }

  reportPlan(name, verified, target, { dryRun: false });
  return target;
}

function stageMove(manifest, target, options) {
  const move =
    (manifest.domainMove && migrateStagedMoveRecord(manifest.domainMove)) ??
    stagedMoveRecord(manifest, target, { detachOld: options.detachOld });
  manifest.domainMove = move;
  options.checkpoint(manifest);
  return move;
}

async function attachHost(context, move) {
  const { committed, domains, target } = context;
  const hostname = target.appDomain;
  const plan = planAttachment(await domains.list({ hostname }), {
    hostname,
    service: committed.worker.name
  });
  assertAttachmentAllowed(plan, {
    hostname,
    service: committed.worker.name
  });
  if (plan.action === "keep") {
    move.attachedDomainId = plan.existing.id ?? null;
    move.targetZoneId = plan.existing.zone_id ?? plan.existing.zoneId ?? null;
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
  move.attachedByThisRun = true;
  context.checkpoint(committed);
  const attached = await domains.attach({
    hostname,
    service: committed.worker.name,
    zoneId: zone.id,
    zoneName: zone.name
  });
  move.attachedDomainId = attached?.id ?? null;
  move.targetZoneId = attached?.zone_id ?? attached?.zoneId ?? zone.id;
  move.state = "attached";
  context.checkpoint(committed);
}

async function verifyHost(context, move) {
  const { committed, domains, target } = context;
  const hostname = target.appDomain;
  const attached = (await domains.list({ hostname })).find(
    (domain) => domain?.hostname === hostname
  );
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
  // wrangler validates assets.directory even for a configuration deployment.
  fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
  move.configurationDeployAttempted = true;
  move.state = "deploying";
  context.checkpoint(committed);
  await context.deployConfiguration({
    accountId: committed.accountId,
    configFile: configPath(committed.name),
    runCommand: context.runCommand
  });
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
  move.canonicalUpdateAttempted = true;
  move.state = "redirecting";
  context.checkpoint(committed);
  await context.setCanonicalPortal({
    hostname: target.appDomain ?? null,
    manifest: target,
    runCommand: context.runCommand,
    zoneId: move.targetZoneId
  });
  move.state = "redirected";
  context.checkpoint(committed);
}

async function detachRetiredHosts(context, move) {
  const { committed, domains, target } = context;
  const keep = new Set([target.appDomain, ...(target.retiredDomains ?? [])].filter(Boolean));
  const owned = new Set([committed.appDomain, ...(committed.retiredDomains ?? [])].filter(Boolean));
  for (const hostname of [...owned].filter((candidate) => !keep.has(candidate))) {
    const domain = (await domains.list({ hostname })).find(
      (candidate) =>
        candidate?.hostname === hostname && candidate?.service === committed.worker.name
    );
    if (!domain) continue;
    move.pendingRemoval = domainSnapshot(domain);
    move.state = "detaching";
    context.checkpoint(committed);
    await domains.remove(domain.id);
    const stillAttached = (await domains.list({ hostname })).some(
      (candidate) =>
        candidate?.hostname === hostname && candidate?.service === committed.worker.name
    );
    if (stillAttached) {
      throw new Error(
        `Refusing to finish: Cloudflare still reports ${hostname} as a custom domain of Worker "${committed.worker.name}".`
      );
    }
    move.removedDomains ??= [];
    move.removedDomains.push(move.pendingRemoval);
    move.pendingRemoval = null;
    context.checkpoint(committed);
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

async function probeOrigin(context, origin) {
  return probeServiceOrigin({ origin, probe: context.probe, retry: context.retry });
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

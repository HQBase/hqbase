import { writeWranglerConfig } from "./config.mjs";
import { configPath } from "./manifest.mjs";

export function domainSnapshot(domain) {
  return {
    hostname: domain.hostname,
    service: domain.service,
    zoneId: domain.zone_id ?? domain.zoneId ?? null,
    zoneName: domain.zone_name ?? domain.zoneName ?? null
  };
}

function uniqueDomains(domains) {
  const unique = new Map();
  for (const domain of domains) {
    if (domain?.hostname) unique.set(domain.hostname, domain);
  }
  return [...unique.values()];
}

export async function assertManagedHosts(context, manifest = context.committed) {
  const { domains } = context;
  const expected = uniqueDomains(
    [manifest.appDomain, ...(manifest.retiredDomains ?? [])]
      .filter(Boolean)
      .map((hostname) => ({ hostname }))
  );
  for (const { hostname } of expected) {
    const records = await domains.list({ hostname });
    const owner = records.find((record) => record?.hostname === hostname)?.service;
    if (owner !== manifest.worker.name) {
      throw new Error(
        `Refusing to continue: saved hostname ${hostname} routes to ${owner ? `Worker "${owner}"` : "no Worker"}, not "${manifest.worker.name}".`
      );
    }
  }
}

async function restoreDomain(context, snapshot) {
  const { committed, domains } = context;
  const records = await domains.list({ hostname: snapshot.hostname });
  const current = records.find((record) => record?.hostname === snapshot.hostname);
  if (current?.service === committed.worker.name) return;
  if (current) {
    throw new Error(
      `${snapshot.hostname} now routes to Worker "${current.service}"; HQBase will not take it over.`
    );
  }
  const zone =
    snapshot.zoneId && snapshot.zoneName
      ? { id: snapshot.zoneId, name: snapshot.zoneName }
      : await domains.findZone(snapshot.hostname);
  if (!zone) throw new Error(`No Cloudflare zone serves ${snapshot.hostname}.`);
  await domains.attach({
    hostname: snapshot.hostname,
    service: committed.worker.name,
    zoneId: zone.id,
    zoneName: zone.name
  });
  const restored = (await domains.list({ hostname: snapshot.hostname })).some(
    (record) => record?.hostname === snapshot.hostname && record?.service === committed.worker.name
  );
  if (!restored) throw new Error(`Cloudflare did not restore ${snapshot.hostname}.`);
}

async function removeDomainForWorker(context, hostname) {
  const { committed, domains } = context;
  const records = await domains.list({ hostname });
  const attached = records.find(
    (record) => record?.hostname === hostname && record?.service === committed.worker.name
  );
  if (!attached) return;
  await domains.remove(attached.id);
  const remains = (await domains.list({ hostname })).some(
    (record) => record?.hostname === hostname && record?.service === committed.worker.name
  );
  if (remains) throw new Error(`Cloudflare still reports ${hostname} on the HQBase Worker.`);
}

export async function rollbackDomainMove(context, move, cause) {
  const { committed, target } = context;
  const reason = cause instanceof Error ? cause.message : String(cause);
  console.error(`Domain move failed after step "${move.state}": ${reason}`);
  const failures = [];
  const recover = async (label, action) => {
    try {
      await action();
    } catch (error) {
      failures.push({ label, message: error instanceof Error ? error.message : String(error) });
    }
  };

  const removed = uniqueDomains([...(move.removedDomains ?? []), move.pendingRemoval]);
  for (const domain of removed) {
    await recover(`reattach ${domain.hostname}`, () => restoreDomain(context, domain));
  }
  if (move.configurationDeployAttempted) {
    await recover("restore Worker configuration", async () => {
      writeWranglerConfig(committed);
      await context.deployConfiguration({
        accountId: committed.accountId,
        configFile: configPath(committed.name),
        runCommand: context.runCommand
      });
    });
  }
  if (move.canonicalUpdateAttempted) {
    await recover("restore canonical portal", () =>
      context.setCanonicalPortal({
        hostname: committed.appDomain ?? null,
        manifest: committed,
        runCommand: context.runCommand
      })
    );
  }
  if (failures.length === 0 && move.attachedByThisRun && target.appDomain) {
    await recover(`detach ${target.appDomain}`, () =>
      removeDomainForWorker(context, target.appDomain)
    );
  }
  await recover("verify restored domains", () => assertManagedHosts(context));
  if (move.canonicalUpdateAttempted) {
    await recover("verify restored canonical portal", async () => {
      const actual = await context.readCanonicalPortal({
        manifest: committed,
        runCommand: context.runCommand
      });
      if (actual !== (committed.appDomain ?? null)) {
        throw new Error(
          `D1 reports ${actual ?? "no canonical portal"}, not ${committed.appDomain ?? "no canonical portal"}.`
        );
      }
    });
  }

  writeWranglerConfig(committed);
  if (failures.length === 0) {
    delete committed.domainMove;
    try {
      context.checkpoint(committed);
      console.error("The failed domain move was fully rolled back.");
      return;
    } catch (error) {
      failures.push({
        label: "save restored deployment record",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  move.state = "recovery-required";
  move.recoveryFailures = failures.map((failure) => failure.label);
  committed.domainMove = move;
  try {
    context.checkpoint(committed);
  } catch (error) {
    failures.push({
      label: "save recovery record",
      message: error instanceof Error ? error.message : String(error)
    });
  }
  for (const failure of failures) {
    console.error(`Rollback is incomplete (${failure.label}): ${failure.message}`);
  }
  console.error(
    "The deployment remains locked for recovery. Re-run the same domain command after you correct the reported Cloudflare or local-file error."
  );
}

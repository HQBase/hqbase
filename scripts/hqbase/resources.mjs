import { run } from "./command.mjs";
import {
  assertAccountId,
  assertCurrentManifest,
  assertD1Id,
  assertUnambiguousManifest,
  migrateVersion2
} from "./lifecycle-manifest.mjs";

export function resolveCloudflareAccount(expectedId, options = {}) {
  const runCommand = options.runCommand ?? run;
  if (expectedId != null) {
    assertAccountId(expectedId);
  }

  const output = runCommand("pnpm", ["exec", "wrangler", "whoami", "--json"], {
    quiet: true,
    stdoutOnly: true
  });
  const identity = parseJson(output, "Wrangler account identity");
  const accounts = Array.isArray(identity.accounts) ? identity.accounts : [];
  const environmentId = options.environment?.CLOUDFLARE_ACCOUNT_ID;

  if (environmentId !== undefined) {
    assertAccountId(environmentId);
  }
  if (expectedId && environmentId && expectedId !== environmentId) {
    throw new Error(
      `Refusing to continue: manifest Cloudflare account ${expectedId} does not match CLOUDFLARE_ACCOUNT_ID ${environmentId}.`
    );
  }

  const selectedId =
    expectedId ?? environmentId ?? (accounts.length === 1 ? accounts[0]?.id : null);
  if (!selectedId) {
    throw new Error(
      "Set CLOUDFLARE_ACCOUNT_ID because Wrangler has access to more than one Cloudflare account."
    );
  }
  assertAccountId(selectedId);
  if (!accounts.some((account) => account?.id === selectedId)) {
    throw new Error(
      `Refusing to continue: Wrangler is not authenticated for Cloudflare account ${selectedId}.`
    );
  }
  return selectedId;
}

export function prepareManifest(manifest, accountId, options = {}) {
  const runCommand = options.runCommand ?? run;
  const isMigration = manifest?.version === 2;
  let current = manifest;

  if (isMigration) {
    current = migrateVersion2(current, accountId);
  }
  assertCurrentManifest(current, { allowMissingQueueIds: isMigration });
  if (current.accountId !== accountId) {
    throw new Error(
      `Refusing to continue: deployment manifest account ${current.accountId} does not match authenticated account ${accountId}.`
    );
  }

  assertUnambiguousManifest(current);
  const d1 = inspectD1(current, current.d1, { runCommand });
  inspectR2(current, current.r2, { runCommand });
  const primary = inspectQueue(current, current.queue.primary, { runCommand });
  const deadLetter = inspectQueue(current, current.queue.deadLetter, { runCommand });

  if (isMigration) {
    current.d1.id = d1.id;
    current.queue.primary.id = primary.id;
    current.queue.deadLetter.id = deadLetter.id;
    assertCurrentManifest(current);
    options.checkpoint?.(current);
  }
  return current;
}

export function inspectD1(manifest, resource, options = {}) {
  if (!needsVerification(resource)) {
    return null;
  }
  assertD1Id(resource.id);
  const output = wrangler(manifest, ["d1", "list", "--json"], options);
  const databases = parseJson(output, "D1 database list");
  const database = Array.isArray(databases)
    ? databases.find((candidate) => candidate?.uuid === resource.id)
    : null;
  if (!database) {
    throw new Error(`Refusing to continue: D1 database ${resource.id} is missing.`);
  }
  if (database.name !== resource.name) {
    throw new Error(
      `Refusing to continue: D1 database ${resource.id} is named "${database.name}", not "${resource.name}".`
    );
  }
  return { id: database.uuid, name: database.name };
}

export function inspectR2(manifest, resource, options = {}) {
  if (!needsVerification(resource)) {
    return null;
  }
  const output = wrangler(manifest, ["r2", "bucket", "info", resource.bucket, "--json"], options);
  const bucket = parseJson(output, "R2 bucket information");
  if (bucket?.name !== resource.bucket) {
    throw new Error(
      `Refusing to continue: R2 returned "${bucket?.name ?? "no name"}" for bucket "${resource.bucket}".`
    );
  }
  return { name: bucket.name };
}

export function inspectQueue(manifest, resource, options = {}) {
  if (!needsVerification(resource)) {
    return null;
  }
  const output = wrangler(manifest, ["queues", "info", resource.name], options);
  const queue = parseQueueInfo(output);
  if (queue.name !== resource.name) {
    throw new Error(
      `Refusing to continue: Queue ${resource.id ?? resource.name} is named "${queue.name}", not "${resource.name}".`
    );
  }
  if (resource.id !== null && resource.id !== queue.id) {
    throw new Error(
      `Refusing to continue: queue "${resource.name}" has ID ${queue.id}, not ${resource.id}.`
    );
  }
  return queue;
}

export function wrangler(manifest, args, options = {}) {
  const runCommand = options.runCommand ?? run;
  return runCommand("pnpm", ["exec", "wrangler", ...args], {
    dryRun: options.dryRun,
    quiet: options.quiet ?? true,
    stdoutOnly: options.stdoutOnly ?? true,
    allowFailure: options.allowFailure,
    env: {
      ...options.env,
      CLOUDFLARE_ACCOUNT_ID: manifest.accountId
    }
  });
}

function needsVerification(resource) {
  return resource.ownership === "created" || resource.ownership === "reused";
}

function parseQueueInfo(output) {
  const name = output.match(/^Queue Name:\s*(.+)$/m)?.[1]?.trim();
  const id = output.match(/^Queue ID:\s*([0-9a-f]{32})$/im)?.[1];
  if (!name || !id) {
    throw new Error("Could not parse the queue name and ID from Wrangler output.");
  }
  return { id, name };
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Could not parse ${label} from Wrangler JSON output.`);
  }
}

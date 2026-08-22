const accountIdPattern = /^[0-9a-f]{32}$/i;
const d1IdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const queueIdPattern = /^[0-9a-f]{32}$/i;
const ownershipStates = new Set(["unclaimed", "creating", "created", "reused", "removed"]);
const placeholderD1Id = "00000000-0000-0000-0000-000000000000";

export function assertCurrentManifest(manifest, options = {}) {
  if (manifest?.version !== 3) {
    throw new Error(
      'Refusing to continue: manifest field "version" must be 3. Version 1 and incomplete version 2 manifests require manual recovery from verified Cloudflare records.'
    );
  }
  assertName(manifest, "name");
  assertAccountId(manifest.accountId);
  assertName(manifest, "worker.name");
  if (typeof manifest.worker?.deployed !== "boolean") {
    throw new Error('Refusing to continue: manifest field "worker.deployed" must be a boolean.');
  }
  assertName(manifest, "d1.name");
  assertName(manifest, "r2.bucket");
  assertName(manifest, "queue.primary.name");
  assertName(manifest, "queue.deadLetter.name");
  assertOwnership(manifest.d1, "d1");
  assertOwnership(manifest.r2, "r2");
  assertOwnership(manifest.queue.primary, "queue.primary");
  assertOwnership(manifest.queue.deadLetter, "queue.deadLetter");

  if (["created", "reused", "removed"].includes(manifest.d1.ownership)) {
    assertD1Id(manifest.d1.id);
  } else if (manifest.d1.id !== null) {
    throw new Error('Refusing to continue: an unowned D1 resource must have a null "d1.id".');
  }
  for (const [path, resource] of [
    ["queue.primary", manifest.queue.primary],
    ["queue.deadLetter", manifest.queue.deadLetter]
  ]) {
    if (
      ["created", "reused", "removed"].includes(resource.ownership) &&
      !(options.allowMissingQueueIds && resource.id === null)
    ) {
      assertQueueId(resource.id, path);
    } else if (resource.id !== null) {
      throw new Error(`Refusing to continue: an unowned queue must have a null "${path}.id".`);
    }
  }
}

export function migrateVersion2(manifest, accountId) {
  if (
    typeof manifest.d1?.created !== "boolean" ||
    typeof manifest.d1?.reused !== "boolean" ||
    typeof manifest.r2?.created !== "boolean" ||
    typeof manifest.r2?.reused !== "boolean" ||
    manifest.queue?.created !== true ||
    (!manifest.d1.created && !manifest.d1.reused) ||
    (!manifest.r2.created && !manifest.r2.reused)
  ) {
    throw new Error(
      "Refusing to continue: an incomplete version 2 manifest cannot prove independent resource ownership. Recover it from verified Cloudflare records."
    );
  }
  if ((manifest.d1.created && manifest.d1.reused) || (manifest.r2.created && manifest.r2.reused)) {
    throw new Error(
      "Refusing to continue: a version 2 manifest cannot record a resource as both created and reused."
    );
  }
  assertD1Id(manifest.d1.id);

  return {
    ...manifest,
    version: 3,
    accountId,
    d1: {
      name: manifest.d1.name,
      id: manifest.d1.id,
      ownership: manifest.d1.reused ? "reused" : "created"
    },
    r2: {
      bucket: manifest.r2.bucket,
      ownership: manifest.r2.reused ? "reused" : "created"
    },
    queue: {
      primary: { name: manifest.queue.name, id: null, ownership: "created" },
      deadLetter: { name: manifest.queue.deadLetterName, id: null, ownership: "created" }
    }
  };
}

export function assertUnambiguousManifest(manifest) {
  for (const [path, resource] of [
    ["d1", manifest.d1],
    ["r2", manifest.r2],
    ["queue.primary", manifest.queue.primary],
    ["queue.deadLetter", manifest.queue.deadLetter]
  ]) {
    if (resource.ownership === "creating") {
      throw new Error(
        `Refusing to continue: manifest field "${path}.ownership" is "creating", so the last create request has an ambiguous result. Verify the Cloudflare resource and repair the manifest before retrying.`
      );
    }
  }
}

export function assertD1Id(id) {
  if (!d1IdPattern.test(id ?? "") || id === placeholderD1Id) {
    throw new Error(
      'Refusing to continue: manifest field "d1.id" must be a real D1 database UUID, not a missing, invalid, or placeholder value.'
    );
  }
}

export function assertAccountId(id) {
  if (!accountIdPattern.test(id ?? "")) {
    throw new Error(
      "Refusing to continue: the Cloudflare account ID must be 32 hexadecimal characters."
    );
  }
}

function assertOwnership(resource, path) {
  if (!ownershipStates.has(resource?.ownership)) {
    throw new Error(
      `Refusing to continue: manifest field "${path}.ownership" must be an explicit supported state.`
    );
  }
}

function assertName(manifest, path) {
  const value = path.split(".").reduce((current, key) => current?.[key], manifest);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Refusing to continue: manifest field "${path}" must be a non-empty string.`);
  }
}

function assertQueueId(id, path) {
  if (!queueIdPattern.test(id ?? "")) {
    throw new Error(
      `Refusing to continue: manifest field "${path}.id" must be a 32-character queue ID.`
    );
  }
}

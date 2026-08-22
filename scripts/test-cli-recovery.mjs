import fs from "node:fs";

import { parseD1DatabaseId, run } from "./hqbase/command.mjs";
import { destroy } from "./hqbase/destroy.mjs";
import { install } from "./hqbase/install.mjs";
import {
  assertDeploymentName,
  deploymentDir,
  loadManifest,
  manifestExists,
  writeManifest
} from "./hqbase/manifest.mjs";
import { prepareManifest } from "./hqbase/resources.mjs";

const name = process.argv[2];
assertDeploymentName(name);
if (!name.startsWith("recovery-")) {
  throw new Error('The recovery test deployment name must start with "recovery-".');
}
if (manifestExists(name)) {
  throw new Error(`Recovery test manifest "${name}" already exists.`);
}

const flags = {
  name,
  "skip-build": true,
  "skip-deploy": true,
  email: false
};
const checkpoints = ["d1", "r2", "queue.primary", "queue.deadLetter"];
let finished = false;
let cleanupManifest;

try {
  for (const path of checkpoints) {
    expectInterruption(path);
  }

  install(flags);
  install(flags);
  const manifest = loadManifest(name);
  for (const path of checkpoints) {
    if (resourceAt(manifest, path).ownership !== "created") {
      throw new Error(`Recovery test did not finish resource "${path}".`);
    }
  }

  expectManifestFailure((value) => {
    value.d1.id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  }, /D1 database .* is missing/);
  expectManifestFailure((value) => {
    value.d1.name = `${value.d1.name}-conflict`;
  }, /D1 database .* is named .* not/);
  expectManifestFailure((value) => {
    value.r2.bucket = `${value.r2.bucket}-missing`;
  }, /Command failed .* r2 bucket info .*missing/);
  expectManifestFailure((value) => {
    value.queue.primary.id = "f".repeat(32);
  }, /queue .* has ID .* not/);

  cleanupManifest = verifyVersion2Migration(manifest);
  const reused = structuredClone(cleanupManifest);
  for (const path of checkpoints) {
    resourceAt(reused, path).ownership = "reused";
  }
  writeManifest(reused);
  destroy({ name, scope: "all", yes: true });
  prepareManifest(reused, reused.accountId);

  writeManifest(cleanupManifest);
  destroy({ name, scope: "all", yes: true });
  finished = true;
} finally {
  if (!finished) {
    try {
      if (!manifestExists(name) && cleanupManifest) {
        writeManifest(cleanupManifest);
      }
      if (manifestExists(name)) {
        destroy({ name, scope: "all", yes: true });
      }
    } catch (error) {
      console.error(
        `Automatic recovery-test cleanup stopped safely: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

verifyAmbiguousCreate(`${name}-amb`);
console.log(`Verified operator recovery and cleanup safety for "${name}".`);

function expectInterruption(path) {
  let interrupted = false;
  try {
    install(flags, {
      checkpoint(manifest, options) {
        writeManifest(manifest, options);
        if (!interrupted && resourceAt(manifest, path).ownership === "created") {
          interrupted = true;
          throw new Error(`Expected recovery test interruption after ${path}.`);
        }
      }
    });
  } catch (error) {
    if (!interrupted || !(error instanceof Error) || !error.message.includes("Expected recovery")) {
      throw error;
    }
  }
  if (!interrupted) {
    throw new Error(`Recovery test did not interrupt after "${path}".`);
  }
}

function expectManifestFailure(change, expectedError) {
  const original = loadManifest(name);
  const changed = structuredClone(original);
  change(changed);
  writeManifest(changed);
  let failure;
  try {
    install(flags);
  } catch (error) {
    failure = error;
  } finally {
    writeManifest(original);
  }
  if (!(failure instanceof Error) || !expectedError.test(failure.message)) {
    throw new Error(
      `Recovery test did not get the expected fail-closed result: ${failure instanceof Error ? failure.message : "no error"}`
    );
  }
}

function verifyVersion2Migration(current) {
  const legacy = {
    ...structuredClone(current),
    version: 2,
    d1: { name: current.d1.name, id: current.d1.id, created: true, reused: false },
    r2: { bucket: current.r2.bucket, created: true, reused: false },
    queue: {
      name: current.queue.primary.name,
      deadLetterName: current.queue.deadLetter.name,
      created: true
    }
  };
  delete legacy.accountId;
  writeManifest(legacy);
  install(flags);

  const migrated = loadManifest(name);
  if (
    migrated.version !== 3 ||
    migrated.accountId !== current.accountId ||
    migrated.d1.ownership !== "created" ||
    migrated.r2.ownership !== "created" ||
    migrated.queue.primary.id !== current.queue.primary.id ||
    migrated.queue.deadLetter.id !== current.queue.deadLetter.id
  ) {
    throw new Error("Recovery test did not migrate the verified version 2 manifest.");
  }
  return migrated;
}

function verifyAmbiguousCreate(ambiguousName) {
  assertDeploymentName(ambiguousName);
  if (manifestExists(ambiguousName)) {
    throw new Error(`Ambiguous-state test manifest "${ambiguousName}" already exists.`);
  }
  const ambiguousFlags = { ...flags, name: ambiguousName };
  let databaseId;
  let deleted = false;
  try {
    try {
      install(ambiguousFlags, {
        runCommand(command, args, options) {
          const output = run(command, args, options);
          if (args.slice(0, 4).join(" ") === "exec wrangler d1 create") {
            databaseId = parseD1DatabaseId(output);
            throw new Error("Expected interruption before the D1 ownership checkpoint.");
          }
          return output;
        }
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Expected interruption")) {
        throw error;
      }
    }

    if (!databaseId || loadManifest(ambiguousName).d1.ownership !== "creating") {
      throw new Error("Ambiguous-state test did not retain the creating state.");
    }
    let refused = false;
    try {
      install(ambiguousFlags);
    } catch (error) {
      refused = error instanceof Error && error.message.includes("ambiguous result");
    }
    if (!refused) {
      throw new Error("Installer adopted an ambiguous D1 create result.");
    }

    const manifest = loadManifest(ambiguousName);
    run("pnpm", ["exec", "wrangler", "d1", "delete", databaseId, "--skip-confirmation"], {
      env: { CLOUDFLARE_ACCOUNT_ID: manifest.accountId }
    });
    const databases = JSON.parse(
      run("pnpm", ["exec", "wrangler", "d1", "list", "--json"], {
        env: { CLOUDFLARE_ACCOUNT_ID: manifest.accountId },
        quiet: true,
        stdoutOnly: true
      })
    );
    if (databases.some((database) => database.uuid === databaseId)) {
      throw new Error("Ambiguous-state test D1 cleanup was not confirmed.");
    }
    deleted = true;
  } finally {
    if (deleted) {
      fs.rmSync(deploymentDir(ambiguousName), { force: true, recursive: true });
    }
  }
}

function resourceAt(manifest, path) {
  return path.split(".").reduce((value, part) => value?.[part], manifest);
}

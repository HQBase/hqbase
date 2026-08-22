#!/usr/bin/env node
import { run } from "./hqbase/command.mjs";
import { configureDomain } from "./hqbase/domain.mjs";
import { loadManifest } from "./hqbase/manifest.mjs";

const deployment = required("DEPLOYMENT_NAME");
const originalHost = new URL(required("HQBASE_STAGING_URL")).hostname;
const moveHost = required("HQBASE_DOMAIN_MOVE_HOST");
const cleanupOnly = process.argv.includes("--cleanup-only");

if (moveHost === originalHost) {
  throw new Error("HQBASE_DOMAIN_MOVE_HOST must differ from the staging portal hostname.");
}

const options = { deployConfiguration: deployReviewedSource };
let primaryError = null;
let recoveryError = null;
if (cleanupOnly) {
  await recoverOriginal();
  assertManifest(originalHost, originalHost);
} else {
  try {
    await configureDomain(
      {
        name: deployment,
        "app-domain": moveHost,
        "keep-service-origin": true
      },
      options
    );
    assertManifest(moveHost, originalHost);

    await restoreOriginal();
    assertManifest(originalHost, originalHost);
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await recoverOriginal();
    } catch (error) {
      recoveryError = error;
    }
  }
  if (recoveryError) {
    throw new AggregateError(
      [primaryError, recoveryError].filter(Boolean),
      "The staging domain move and its cleanup both failed."
    );
  }
  if (primaryError) throw primaryError;
}

async function recoverOriginal() {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await ensureOriginal();
      assertManifest(originalHost, originalHost);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function ensureOriginal() {
  const current = loadManifest(deployment);
  if (current.domainMove?.toAppDomain === moveHost) {
    await configureDomain(
      {
        name: deployment,
        "app-domain": moveHost,
        "keep-service-origin": true
      },
      options
    );
  } else if (current.domainMove?.toAppDomain === originalHost) {
    await restoreOriginal();
  } else if (current.domainMove) {
    throw new Error(
      `Cannot recover unexpected move to ${current.domainMove.toAppDomain ?? "none"}.`
    );
  }
  if (loadManifest(deployment).appDomain !== originalHost) await restoreOriginal();
}

async function restoreOriginal() {
  return configureDomain(
    {
      name: deployment,
      "app-domain": originalHost,
      "detach-old": true,
      "keep-service-origin": true,
      yes: true
    },
    options
  );
}

function deployReviewedSource({ accountId, configFile, runCommand = run }) {
  runCommand(
    "pnpm",
    ["exec", "wrangler", "deploy", "--strict", "--keep-vars", "--config", configFile],
    { env: { CLOUDFLARE_ACCOUNT_ID: accountId } }
  );
}

function assertManifest(appDomain, authHost) {
  const current = loadManifest(deployment);
  const currentAuthHost = current.authUrl ? new URL(current.authUrl).hostname : null;
  if (current.appDomain !== appDomain || currentAuthHost !== authHost) {
    throw new Error(
      `Unexpected staging domain state: portal=${current.appDomain ?? "none"}, service=${current.authUrl ?? "request origin"}.`
    );
  }
  if (current.domainMove) throw new Error("The staging domain move did not commit cleanly.");
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

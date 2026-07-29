import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import webpush from "web-push";

import { isWorkerNotFound } from "./active-version.mjs";
import { attemptRun, emitCommandOutput, run } from "./command.mjs";

export function deploySource(cwd, options = {}) {
  const execute = options.run ?? run;
  const attempt = options.attempt ?? attemptRun;
  const workersCi = options.workersCi ?? process.env.WORKERS_CI === "1";
  const workerName = options.workerName ?? workerNameFromConfigFile(resolve(cwd, "wrangler.jsonc"));
  const deployArgs = [
    "exec",
    "wrangler",
    "deploy",
    "--keep-vars",
    "--var",
    `HQBASE_WORKER_NAME:${workerName}`
  ];
  if (options.releaseTag) deployArgs.push("--tag", options.releaseTag);

  if (!workersCi) {
    execute("pnpm", deployArgs, cwd);
    return;
  }

  const inspection = attempt(
    "pnpm",
    ["exec", "wrangler", "secret", "list", "--format", "json"],
    cwd
  );
  let missingSecrets;
  try {
    missingSecrets = missingRequiredSecrets(inspection, [
      "BETTER_AUTH_SECRET",
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY"
    ]);
  } catch (error) {
    emitCommandOutput(inspection);
    throw error;
  }
  if (missingSecrets.length === 0) {
    execute("pnpm", deployArgs, cwd);
    return;
  }

  if (missingSecrets.includes("BETTER_AUTH_SECRET")) {
    deployArgs.push("--var", `HQBASE_INSTALLATION_ID:${options.randomUUID?.() ?? randomUUID()}`);
  }

  const workspace = mkdtempSync(resolve(tmpdir(), "hqbase-secrets-"));
  const secretsFile = resolve(workspace, "secrets.json");
  try {
    const secrets = {};
    if (missingSecrets.includes("BETTER_AUTH_SECRET")) {
      const configuredSecret = process.env.HQBASE_AUTH_SECRET;
      const bytes = configuredSecret ? null : (options.randomBytes ?? randomBytes)(32);
      secrets.BETTER_AUTH_SECRET = configuredSecret ?? bytes?.toString("base64url");
    }
    if (
      missingSecrets.includes("VAPID_PUBLIC_KEY") ||
      missingSecrets.includes("VAPID_PRIVATE_KEY")
    ) {
      const configuredPublicKey = process.env.HQBASE_VAPID_PUBLIC_KEY;
      const configuredPrivateKey = process.env.HQBASE_VAPID_PRIVATE_KEY;
      const generated =
        configuredPublicKey && configuredPrivateKey
          ? { publicKey: configuredPublicKey, privateKey: configuredPrivateKey }
          : (options.generateVapidKeys ?? webpush.generateVAPIDKeys)();
      secrets.VAPID_PUBLIC_KEY = generated.publicKey;
      secrets.VAPID_PRIVATE_KEY = generated.privateKey;
    }
    writeFileSync(secretsFile, `${JSON.stringify(secrets)}\n`, { mode: 0o600 });
    execute("pnpm", [...deployArgs, "--secrets-file", secretsFile], cwd);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function workerNameFromConfig(config) {
  if (typeof config?.name !== "string" || !config.name.trim()) {
    throw new Error("wrangler.jsonc must define the deployed Worker name.");
  }
  return config.name.trim();
}

export function needsInitialAuthSecret(result, secretName) {
  return missingRequiredSecrets(result, [secretName]).length > 0;
}

export function missingRequiredSecrets(result, secretNames) {
  if (result.status === 0) {
    const secrets = JSON.parse(result.stdout || "[]");
    if (!Array.isArray(secrets)) throw new Error("Wrangler returned an invalid secret list.");
    const configured = new Set(secrets.map((secret) => secret?.name).filter(Boolean));
    return secretNames.filter((secretName) => !configured.has(secretName));
  }
  if (isWorkerNotFound(result)) return [...secretNames];
  throw result.error ?? new Error(`wrangler secret list exited with status ${result.status}.`);
}

export function executeSql(cwd, command, options = {}) {
  const execute = options.attempt ?? attemptRun;
  const result = execute(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--remote",
      "--command",
      command,
      "--config",
      "wrangler.jsonc"
    ],
    cwd
  );
  if (result.status === 0) return;
  (options.emit ?? emitCommandOutput)(result);
  throw (
    result.error ??
    new Error(`wrangler d1 execute exited with status ${result.status ?? "signal"}.`)
  );
}

function workerNameFromConfigFile(configFile) {
  return workerNameFromConfig(JSON.parse(readFileSync(configFile, "utf8")));
}

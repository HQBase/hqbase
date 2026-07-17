import { execFileSync, spawnSync } from "node:child_process";

export function inspectActiveCommunityRelease(cwd, workerName, options = {}) {
  const attempt = options.attempt ?? attemptRun;
  const capture = options.capture ?? captureRun;
  const status = attempt(
    "pnpm",
    [
      "exec",
      "wrangler",
      "deployments",
      "status",
      "--name",
      workerName,
      "--json",
      "--config",
      "wrangler.jsonc"
    ],
    cwd
  );
  if (status.status !== 0) {
    if (isWorkerNotFound(status)) return null;
    emitCommandOutput(status);
    throw status.error ?? new Error(`wrangler deployments status exited with ${status.status}.`);
  }
  const deployment = JSON.parse(status.stdout || "null");
  const versionId = activeVersionId(deployment);
  const version = JSON.parse(
    capture(
      "pnpm",
      [
        "exec",
        "wrangler",
        "versions",
        "view",
        versionId,
        "--name",
        workerName,
        "--json",
        "--config",
        "wrangler.jsonc"
      ],
      cwd
    )
  );
  return parseActiveCommunityRelease(deployment, version);
}

export function parseActiveCommunityRelease(deployment, version) {
  const versionId = activeVersionId(deployment);
  if (version?.id !== versionId) {
    throw new Error("Wrangler returned details for the wrong active Worker version.");
  }
  const binding = version?.resources?.bindings?.find(
    (candidate) => candidate?.name === "HQBASE_APP_VERSION" && candidate?.type === "plain_text"
  );
  if (typeof binding?.text !== "string" || !/^\d+\.\d+\.\d+/.test(binding.text)) {
    if (isDeployButtonBootstrap(deployment, version)) return null;
    throw new Error("The active Community Worker is missing its installed version binding.");
  }
  return {
    versionId,
    version: binding.text,
    tag:
      typeof version?.annotations?.["workers/tag"] === "string"
        ? version.annotations["workers/tag"]
        : null
  };
}

export function isDeployButtonBootstrap(deployment, version) {
  const bindings = version?.resources?.bindings;
  return (
    deployment?.source === "dash_template" &&
    deployment?.annotations?.["workers/triggered_by"] === "upload" &&
    version?.metadata?.source === "dash" &&
    version?.annotations?.["workers/triggered_by"] === "upload" &&
    version?.resources?.script?.last_deployed_from === "dash_template" &&
    Array.isArray(bindings) &&
    bindings.length === 0 &&
    typeof version?.annotations?.["workers/tag"] !== "string"
  );
}

export function isWorkerNotFound(result) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping.
    /\x1b\[[0-?]*[ -/]*[@-~]/g,
    ""
  );
  return (
    /Worker ".+"(?: \(env: .+\))? not found\./s.test(output) ||
    /This Worker does not exist on your account\./i.test(output) ||
    /workers\.api\.error\.script_not_found|code["': ]+(?:10007|10090)/i.test(output)
  );
}

function activeVersionId(deployment) {
  const activeVersions = Array.isArray(deployment?.versions)
    ? deployment.versions.filter((candidate) => candidate?.percentage === 100)
    : [];
  if (activeVersions.length !== 1 || typeof activeVersions[0]?.version_id !== "string") {
    throw new Error("The Community Worker does not have one active 100-percent version.");
  }
  return activeVersions[0].version_id;
}

function captureRun(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    env: { ...process.env, CI: process.env.CI ?? "true" },
    encoding: "utf8"
  });
}

function attemptRun(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    env: { ...process.env, CI: process.env.CI ?? "true" },
    encoding: "utf8"
  });
}

function emitCommandOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

import { spawnSync } from "node:child_process";

import { rootDir } from "./paths.mjs";

export function run(command, args = [], options = {}) {
  const label = [command, ...args].join(" ");
  if (options.dryRun) {
    console.log(`[dry-run] ${label}`);
    return "";
  }

  console.log(`$ ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: process.env.CI ?? "true"
    }
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout.trim()) {
    console.log(stdout.trim());
  }
  if (stderr.trim()) {
    console.error(stderr.trim());
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`Command failed (${result.status ?? "signal"}): ${label}`);
  }

  return `${stdout}${stderr}`;
}

export function parseD1DatabaseId(output) {
  const match = output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!match) {
    throw new Error("Could not find the D1 database_id in Wrangler output.");
  }
  return match[0];
}

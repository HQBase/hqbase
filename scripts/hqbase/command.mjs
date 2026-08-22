import { spawnProcess } from "../shell.mjs";
import { rootDir } from "./paths.mjs";

export function run(command, args = [], options = {}) {
  const label = [command, ...args].join(" ");
  if (options.dryRun) {
    console.log(`[dry-run] ${label}`);
    return "";
  }

  console.log(`$ ${label}`);
  const result = spawnProcess(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
      ...options.env
    }
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout.trim() && !options.quiet) {
    console.log(stdout.trim());
  }
  if (stderr.trim()) {
    console.error(stderr.trim());
  }

  if (result.status !== 0 && !options.allowFailure) {
    // A missing status means the child never reported an exit code. On POSIX that is a signal,
    // but on Windows it is usually a spawn failure whose cause lives only in `result.error`.
    const detail = result.error ? ` (${result.error.message})` : "";
    throw new Error(`Command failed (${result.status ?? "no exit code"}): ${label}${detail}`);
  }

  return options.stdoutOnly ? stdout : `${stdout}${stderr}`;
}

export function parseD1DatabaseId(output) {
  const match = output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!match) {
    throw new Error("Could not find the D1 database_id in Wrangler output.");
  }
  return match[0];
}

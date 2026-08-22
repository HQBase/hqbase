import { requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { configPath, loadManifest } from "./manifest.mjs";

export function doctor(flags) {
  const name = requireString(flags, "name");
  const manifest = loadManifest(name);
  const options = manifest.accountId ? { env: { CLOUDFLARE_ACCOUNT_ID: manifest.accountId } } : {};

  run("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", configPath(name)], options);
  run(
    "pnpm",
    ["exec", "wrangler", "d1", "info", manifest.d1.name, "--config", configPath(name)],
    options
  );
  run(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      manifest.d1.name,
      "--remote",
      "--command",
      "SELECT value FROM hqbase_schema_state WHERE key = 'product'; SELECT product, installed_version, installed_schema_version FROM release_state WHERE singleton = 1;",
      "--config",
      configPath(name)
    ],
    options
  );
  run("pnpm", ["exec", "wrangler", "r2", "bucket", "info", manifest.r2.bucket, "--json"], options);
  if (manifest.queue) {
    const primary = manifest.queue.primary?.name ?? manifest.queue.name;
    const deadLetter = manifest.queue.deadLetter?.name ?? manifest.queue.deadLetterName;
    run("pnpm", ["exec", "wrangler", "queues", "info", primary], options);
    run("pnpm", ["exec", "wrangler", "queues", "info", deadLetter], options);
  }
  run(
    "pnpm",
    ["exec", "wrangler", "deployments", "status", "--name", manifest.worker.name, "--json"],
    options
  );

  if (manifest.email?.domain) {
    run("pnpm", ["exec", "wrangler", "email", "routing", "settings", manifest.email.domain], {
      ...options,
      allowFailure: true
    });
    run("pnpm", ["exec", "wrangler", "email", "sending", "settings", manifest.email.domain], {
      ...options,
      allowFailure: true
    });
  }
}

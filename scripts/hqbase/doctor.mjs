import { requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { configPath, loadManifest } from "./manifest.mjs";

export function doctor(flags) {
  const name = requireString(flags, "name");
  const manifest = loadManifest(name);

  run("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", configPath(name)]);
  run("pnpm", ["exec", "wrangler", "d1", "info", manifest.d1.name, "--config", configPath(name)], {
    allowFailure: true
  });
  run("pnpm", ["exec", "wrangler", "r2", "bucket", "info", manifest.r2.bucket], {
    allowFailure: true
  });

  if (manifest.email?.domain) {
    run("pnpm", ["exec", "wrangler", "email", "routing", "settings", manifest.email.domain], {
      allowFailure: true
    });
    run("pnpm", ["exec", "wrangler", "email", "sending", "settings", manifest.email.domain], {
      allowFailure: true
    });
  }
}

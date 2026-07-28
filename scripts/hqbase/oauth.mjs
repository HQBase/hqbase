import { optionalBoolean, optionalString, requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { writeWranglerConfig } from "./config.mjs";
import { cloudflareOAuthConfig } from "./install.mjs";
import { configPath, loadManifest, writeManifest } from "./manifest.mjs";

export function configureOAuth(flags) {
  const name = requireString(flags, "name");
  const mode = requireString(flags, "mode");
  const dryRun = optionalBoolean(flags, "dry-run");
  const skipDeploy = optionalBoolean(flags, "skip-deploy");
  const manifest = updateOAuthManifest(loadManifest(name), {
    authUrl: optionalString(flags, "auth-url"),
    clientId: optionalString(flags, "client-id"),
    mode
  });

  writeManifest(manifest, { dryRun });
  writeWranglerConfig(manifest, { dryRun });
  if (!dryRun && !skipDeploy) {
    run("node", ["scripts/release/deploy.mjs", "--config", configPath(name)]);
  }
  console.log(
    dryRun
      ? `HQBase deployment "${name}" OAuth configuration is valid.`
      : `HQBase deployment "${name}" now uses ${manifest.cloudflareOAuth.mode} OAuth.`
  );
}

export function updateOAuthManifest(manifest, input) {
  const authUrl = input.authUrl ?? manifest.authUrl;
  return {
    ...manifest,
    version: 2,
    authUrl,
    cloudflareOAuth: cloudflareOAuthConfig({
      authUrl,
      clientId: input.clientId,
      mode: input.mode
    })
  };
}

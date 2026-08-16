import fs from "node:fs";
import path from "node:path";

import { optionalBoolean, optionalString, requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { writeWranglerConfig } from "./config.mjs";
import { cloudflareOAuthConfig } from "./install.mjs";
import { configPath, loadManifest, writeManifest } from "./manifest.mjs";
import { rootDir } from "./paths.mjs";

const hostPattern = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;

/**
 * Move a deployment to a different custom Worker domain without touching D1, R2, or queues.
 *
 *   pnpm hqbase domain --name dev-01 --app-domain app.example.com [--auth-url https://app.example.com]
 *   pnpm hqbase domain --name dev-01 --detach
 */
export function configureDomain(flags) {
  const name = requireString(flags, "name");
  const dryRun = optionalBoolean(flags, "dry-run");
  const skipDeploy = optionalBoolean(flags, "skip-deploy");
  const previous = loadManifest(name);
  const manifest = updateDomainManifest(previous, {
    appDomain: optionalString(flags, "app-domain"),
    authUrl: optionalString(flags, "auth-url"),
    detach: optionalBoolean(flags, "detach")
  });

  writeManifest(manifest, { dryRun });
  writeWranglerConfig(manifest, { dryRun });
  if (!skipDeploy) {
    // wrangler validates assets.directory even though a trigger deploy uploads nothing from it.
    if (!dryRun) fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
    // Custom domains are Worker triggers: apply them from the config without re-uploading code,
    // so the running release (and its vars/secrets) stays exactly as it is.
    run("pnpm", ["exec", "wrangler", "triggers", "deploy", "--config", configPath(name)], {
      dryRun
    });
    if (previous.authUrl !== manifest.authUrl && !dryRun) {
      // BETTER_AUTH_URL is a var, which only a Worker deploy can change.
      run("node", ["scripts/release/deploy.mjs", "--config", configPath(name)]);
    }
  }

  const target = manifest.appDomain
    ? `custom domain ${manifest.appDomain}`
    : "the default workers.dev hostname";
  console.log(
    dryRun
      ? `HQBase deployment "${name}" domain configuration is valid (${target}).`
      : `HQBase deployment "${name}" now serves from ${target}.`
  );
  for (const note of domainChangeNotes(previous, manifest)) {
    console.log(`  - ${note}`);
  }
}

export function updateDomainManifest(manifest, input) {
  if (input.detach && input.appDomain) {
    throw new Error("Use either --app-domain or --detach, not both.");
  }
  if (!input.detach && !input.appDomain) {
    throw new Error("Domain change requires --app-domain <host> or --detach.");
  }
  const appDomain = input.detach ? undefined : normalizeHost(input.appDomain);
  const authUrl = resolveAuthUrl(manifest, appDomain, input.authUrl);
  const cloudflareOAuth = manifest.cloudflareOAuth ?? { mode: "official" };

  return {
    ...manifest,
    version: 2,
    appDomain,
    authUrl,
    // Re-validate customer-managed OAuth against the new origin; official mode is unaffected.
    cloudflareOAuth: cloudflareOAuthConfig({
      authUrl,
      clientId: cloudflareOAuth.clientId,
      mode: cloudflareOAuth.mode
    })
  };
}

export function domainChangeNotes(previous, next) {
  const notes = [];
  if (previous.appDomain && previous.appDomain !== next.appDomain) {
    notes.push(
      `Cloudflare detaches ${previous.appDomain} from the Worker on deploy; its DNS record is removed automatically.`
    );
  }
  if (next.appDomain && previous.appDomain !== next.appDomain) {
    notes.push(
      `${next.appDomain} must be a zone in this Cloudflare account; the deploy creates its DNS record and certificate.`
    );
  }
  if (previous.authUrl !== next.authUrl) {
    notes.push(
      `Auth origin changed to ${next.authUrl ?? "the request origin"}: existing sessions are invalidated and users must sign in again.`
    );
    if (next.cloudflareOAuth?.mode === "customer") {
      notes.push(
        `Customer-managed OAuth: re-register the redirect URIs on ${next.authUrl} for /api/setup/cloudflare/oauth/callback, /api/updates/cloudflare/oauth/callback, and /api/domains/cloudflare/oauth/callback.`
      );
    }
  }
  notes.push("D1, R2, and queues were not modified.");
  return notes;
}

function resolveAuthUrl(manifest, appDomain, explicit) {
  if (explicit) {
    return explicit;
  }
  if (!manifest.authUrl) {
    return undefined;
  }
  // The previous canonical origin no longer exists once the domain moves; follow the new host.
  return appDomain ? `https://${appDomain}` : undefined;
}

function normalizeHost(value) {
  const host = String(value).trim().toLowerCase().replace(/\.$/, "");
  if (!hostPattern.test(host)) {
    throw new Error(
      `--app-domain must be a bare hostname such as app.example.com (got "${value}").`
    );
  }
  return host;
}

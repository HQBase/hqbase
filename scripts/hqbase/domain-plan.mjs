import { cloudflareOAuthConfig } from "./install.mjs";

const hostPattern = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;

/**
 * The proposed manifest. Nothing here is written until every Cloudflare step is verified.
 */
export function updateDomainManifest(manifest, input) {
  if (input.detach && input.appDomain) {
    throw new Error("Use either --app-domain or --detach, not both.");
  }
  if (!input.detach && !input.appDomain) {
    throw new Error("Domain change requires --app-domain <host> or --detach.");
  }
  const appDomain = input.detach ? undefined : normalizeHost(input.appDomain);
  const { authUrl } = resolveServiceOrigin(manifest, { ...input, appDomain });
  if (input.detachOld && manifest.appDomain && hostOf(authUrl) === manifest.appDomain) {
    throw new Error(
      `Refusing to detach ${manifest.appDomain}: it serves the machine-facing service origin ${authUrl}. Move the service origin first, or keep the hostname attached.`
    );
  }
  const cloudflareOAuth = manifest.cloudflareOAuth ?? { mode: "official" };
  const retiredDomains = resolveRetiredDomains(manifest, {
    appDomain,
    authUrl,
    detach: input.detach,
    detachOld: input.detachOld
  });

  return {
    ...manifest,
    appDomain,
    authUrl,
    retiredDomains,
    // Re-validate customer-managed OAuth against the service origin; official mode is unaffected.
    cloudflareOAuth: cloudflareOAuthConfig({
      authUrl,
      clientId: cloudflareOAuth.clientId,
      mode: cloudflareOAuth.mode
    })
  };
}

/**
 * A portal change never changes the webhook, recovery, or automation origin. When the service
 * origin is served by the hostname that is being replaced, the operator must choose.
 */
export function resolveServiceOrigin(manifest, input) {
  const previous = manifest.authUrl;
  if (input.keepServiceOrigin && input.moveServiceOrigin) {
    throw new Error("Use either --keep-service-origin or --move-service-origin, not both.");
  }
  if (input.detach) {
    if (input.authUrl) {
      throw new Error(
        "--auth-url cannot survive --detach because the deployment keeps no custom hostname. Use --move-service-origin to fall back to the request origin."
      );
    }
    if (!previous) {
      return { authUrl: undefined, moved: false };
    }
    if (!input.moveServiceOrigin) {
      throw new Error(
        `Refusing to detach: ${previous} is the machine-facing service origin and it is served by the custom domain. Re-run with --move-service-origin to fall back to the request origin, and re-register every agent token, OAuth redirect URI, and webhook.`
      );
    }
    return { authUrl: undefined, moved: true };
  }
  if (input.authUrl) {
    assertCanonicalOrigin(input.authUrl);
    return { authUrl: input.authUrl, moved: previous !== input.authUrl };
  }
  const ridesOnPortal = Boolean(
    previous && manifest.appDomain && previous === `https://${manifest.appDomain}`
  );
  if (!ridesOnPortal) {
    return { authUrl: previous, moved: false };
  }
  if (input.moveServiceOrigin) {
    return { authUrl: `https://${input.appDomain}`, moved: true };
  }
  if (input.keepServiceOrigin) {
    return { authUrl: previous, moved: false };
  }
  throw new Error(
    `Refusing to move the portal: ${previous} is also the machine-facing service origin. Re-run with --keep-service-origin to keep the old hostname attached for automation, or --move-service-origin to move the auth issuer, Mail API audience, and MCP audience to the new hostname.`
  );
}

export function domainChangeNotes(previous, next) {
  const notes = [];
  if (previous.appDomain && previous.appDomain !== next.appDomain) {
    const retired = (next.retiredDomains ?? []).includes(previous.appDomain);
    notes.push(
      retired
        ? `${previous.appDomain} stays attached and redirects browsers to the new portal; API, MCP, and mail discovery on it are unchanged.`
        : `${previous.appDomain} is detached from the Worker and its DNS record is deleted.`
    );
  }
  if (next.appDomain && previous.appDomain !== next.appDomain) {
    notes.push(
      `${next.appDomain} must be a zone in this Cloudflare account; the attach step creates its DNS record and certificate.`
    );
  }
  if (previous.authUrl !== next.authUrl) {
    notes.push(
      `Service origin changed to ${next.authUrl ?? "the request origin"}: existing sessions end, and every agent token, OAuth redirect URI, and webhook must be re-registered.`
    );
    if (next.cloudflareOAuth?.mode === "customer") {
      notes.push(
        `Customer-managed OAuth: re-register the redirect URIs on ${next.authUrl} for /api/setup/cloudflare/oauth/callback, /api/updates/cloudflare/oauth/callback, and /api/domains/cloudflare/oauth/callback.`
      );
    }
  } else if (next.authUrl) {
    notes.push(`Service origin ${next.authUrl} is unchanged.`);
  }
  notes.push("D1, R2, and queues were not modified.");
  return notes;
}

export function stagedMoveRecord(manifest, target, options = {}) {
  return {
    startedAt: options.now ?? new Date().toISOString(),
    state: "staged",
    fromAppDomain: manifest.appDomain ?? null,
    toAppDomain: target.appDomain ?? null,
    fromAuthUrl: manifest.authUrl ?? null,
    toAuthUrl: target.authUrl ?? null,
    detachOld: Boolean(options.detachOld),
    attachedDomainId: null,
    attachedByThisRun: false,
    deployed: false
  };
}

export function assertResumable(manifest, target) {
  const move = manifest.domainMove;
  if (!move) {
    return;
  }
  if (
    move.toAppDomain !== (target.appDomain ?? null) ||
    move.toAuthUrl !== (target.authUrl ?? null)
  ) {
    throw new Error(
      `Refusing to continue: deployment "${manifest.name}" has an unfinished domain move to ${move.toAppDomain ?? "the default hostname"} started at ${move.startedAt}. Re-run the same move to resume it, or repair the manifest from verified Cloudflare records.`
    );
  }
}

function resolveRetiredDomains(manifest, input) {
  const retired = new Set(manifest.retiredDomains ?? []);
  if (input.detach) {
    return [];
  }
  if (input.detachOld) {
    retired.clear();
  } else if (manifest.appDomain && manifest.appDomain !== input.appDomain) {
    retired.add(manifest.appDomain);
  }
  if (input.appDomain) {
    retired.delete(input.appDomain);
  }
  const serviceHost = hostOf(input.authUrl);
  if (
    serviceHost &&
    serviceHost !== input.appDomain &&
    !retired.has(serviceHost) &&
    !input.detach
  ) {
    // The service origin must keep answering, so its hostname stays attached.
    retired.add(serviceHost);
  }
  return [...retired];
}

export function hostOf(origin) {
  if (!origin) {
    return undefined;
  }
  try {
    return new URL(origin).hostname;
  } catch {
    return undefined;
  }
}

function assertCanonicalOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--auth-url must be a valid canonical HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("--auth-url must be a canonical HTTPS origin without a path.");
  }
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

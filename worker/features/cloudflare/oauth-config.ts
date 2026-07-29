import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { hqbaseProductConfig } from "../../lib/product-config";

const AUTHORIZATION_ENDPOINT = "https://dash.cloudflare.com/oauth2/auth";

export type OAuthConfigEnv = Pick<
  WorkerEnv,
  "BETTER_AUTH_URL" | "CLOUDFLARE_OAUTH_CLIENT_ID" | "CLOUDFLARE_OAUTH_MODE"
>;

type CloudflareOAuthMode = "customer" | "official";

type OAuthFlowConfig = {
  callbackPath: string;
  operation: "domains" | "setup" | "updates";
};

export function resolveOAuthConfig(
  request: Request,
  env: OAuthConfigEnv,
  flow: OAuthFlowConfig
): {
  clientId: string;
  mode: CloudflareOAuthMode;
  redirectUri: string;
} {
  const mode = oauthMode(env);
  if (mode === "official") {
    return {
      clientId: hqbaseProductConfig.cloudflareOAuthClientId,
      mode,
      redirectUri: hqbaseProductConfig.cloudflareOAuthRedirectUri
    };
  }
  const canonicalOrigin = customerOAuthOrigin(env.BETTER_AUTH_URL);
  if (new URL(request.url).origin !== canonicalOrigin) {
    throw invalidOAuthConfig(
      "Open the canonical HQBase URL before authorizing the customer-managed OAuth client."
    );
  }
  return {
    clientId: oauthClientId(env),
    mode,
    redirectUri: `${canonicalOrigin}${flow.callbackPath}`
  };
}

export function cloudflareAuthorizationUrl(
  request: Request,
  config: ReturnType<typeof resolveOAuthConfig>,
  flow: OAuthFlowConfig,
  state: string,
  codeChallenge: string
): URL {
  if (config.mode === "official") {
    const relay = new URL("/oauth/authorize", hqbaseProductConfig.cloudflareOAuthRelayUrl);
    relay.searchParams.set("callback", `${new URL(request.url).origin}${flow.callbackPath}`);
    relay.searchParams.set("operation", flow.operation);
    relay.searchParams.set("state", state);
    relay.searchParams.set("code_challenge", codeChallenge);
    return relay;
  }

  const target = new URL(AUTHORIZATION_ENDPOINT);
  target.searchParams.set("client_id", config.clientId);
  target.searchParams.set("redirect_uri", config.redirectUri);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("state", state);
  target.searchParams.set("code_challenge", codeChallenge);
  target.searchParams.set("code_challenge_method", "S256");
  target.searchParams.set("scope", hqbaseProductConfig.cloudflareOAuthScopes[flow.operation]);
  return target;
}

export function oauthClientId(
  env: Pick<OAuthConfigEnv, "CLOUDFLARE_OAUTH_CLIENT_ID" | "CLOUDFLARE_OAUTH_MODE">
): string {
  if (oauthMode(env) === "official") return hqbaseProductConfig.cloudflareOAuthClientId;
  const clientId = env.CLOUDFLARE_OAUTH_CLIENT_ID?.trim();
  if (!clientId || clientId.length > 256) {
    throw invalidOAuthConfig("Customer-managed OAuth requires a valid CLOUDFLARE_OAUTH_CLIENT_ID.");
  }
  return clientId;
}

export function isInvalidOAuthConfig(error: unknown): error is AppError {
  return error instanceof AppError && error.code === "CLOUDFLARE_OAUTH_CONFIG_INVALID";
}

function oauthMode(env: Pick<OAuthConfigEnv, "CLOUDFLARE_OAUTH_MODE">): CloudflareOAuthMode {
  const value = env.CLOUDFLARE_OAUTH_MODE?.trim() || "official";
  if (value !== "official" && value !== "customer") {
    throw invalidOAuthConfig('CLOUDFLARE_OAUTH_MODE must be "official" or "customer".');
  }
  return value;
}

function customerOAuthOrigin(value: string | undefined): string {
  if (!value) {
    throw invalidOAuthConfig(
      "Customer-managed OAuth requires BETTER_AUTH_URL to be the canonical HTTPS HQBase origin."
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidOAuthConfig("BETTER_AUTH_URL must be a valid canonical HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw invalidOAuthConfig("BETTER_AUTH_URL must be a canonical HTTPS origin without a path.");
  }
  return url.origin;
}

function invalidOAuthConfig(message: string): AppError {
  return new AppError("CLOUDFLARE_OAUTH_CONFIG_INVALID", message, 500);
}

import { sql } from "drizzle-orm";

import { getRow } from "../db/drizzle";
import type { WorkerEnv } from "../lib/env";

import { mcpFullResource, mcpResource } from "./auth";
import { parseOAuthList } from "./oauth-principal";

const offlineAccessScope = "offline_access";
const authorizationRequestPaths = new Set(["/api/auth/oauth2/authorize", "/api/auth/device/code"]);

type ClientGrantRow = {
  disabled: number | null;
  grantTypes: string | null;
  scopes: string | null;
};

/**
 * Adds `offline_access` to an MCP authorization request when the client registered the
 * `refresh_token` grant. MCP SEP-2207 keeps this scope out of resource challenges, so HQBase
 * applies it as authorization-server policy before Better Auth reads and signs the request.
 */
export async function withMcpOfflineAccess(env: WorkerEnv, request: Request): Promise<Request> {
  const url = new URL(request.url);
  if (!authorizationRequestPaths.has(url.pathname)) return request;

  const isFormPost =
    request.method === "POST" &&
    (request.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("application/x-www-form-urlencoded");
  if (request.method !== "GET" && !isFormPost) return request;

  const params = isFormPost ? new URLSearchParams(await request.clone().text()) : url.searchParams;
  const scope = await scopeWithOfflineAccess(env, request, params);
  if (!scope) return request;

  params.set("scope", scope);
  if (!isFormPost) return new Request(url, request);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(url, { body: params.toString(), headers, method: request.method });
}

async function scopeWithOfflineAccess(
  env: WorkerEnv,
  request: Request,
  params: URLSearchParams
): Promise<string | null> {
  const clientId = params.get("client_id");
  const scopes = params.get("scope")?.split(" ").filter(Boolean) ?? [];
  const resources = params.getAll("resource");
  const mcpResources = new Set([mcpResource(env, request), mcpFullResource(env, request)]);
  if (
    params.has("sig") ||
    !clientId ||
    scopes.length === 0 ||
    scopes.includes(offlineAccessScope) ||
    resources.length === 0 ||
    !resources.every((resource) => mcpResources.has(resource))
  ) {
    return null;
  }

  const client = await getRow<ClientGrantRow>(
    env.DB,
    sql`SELECT disabled, grantTypes, scopes FROM oauthClient WHERE clientId = ${clientId}`
  );
  const clientScopes = parseOAuthList(client?.scopes ?? null);
  if (
    !client ||
    client.disabled === 1 ||
    !parseOAuthList(client.grantTypes).includes("refresh_token") ||
    (clientScopes.length > 0 && !clientScopes.includes(offlineAccessScope))
  ) {
    return null;
  }
  return [...scopes, offlineAccessScope].join(" ");
}

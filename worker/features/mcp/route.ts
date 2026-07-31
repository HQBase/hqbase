import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { authIssuer, authOrigin, createAuth, mcpFullResource, mcpResource } from "../../auth/auth";
import { hashOAuthToken } from "../../auth/oauth-token";
import { isPasswordSetupRequired } from "../../auth/password-setup";
import type { WorkerEnv } from "../../lib/env";
import type { WorkspaceRole } from "../../lib/validation";
import { workspaceRoleSchema } from "../../lib/validation";

import { serveMcp } from "./server";

export const mcpScopes = ["mail:read", "mail:write", "mail:send", "offline_access"] as const;
const mcpMailScopes = ["mail:read", "mail:write", "mail:send"] as const;

type McpProfile = {
  metadataPath: string;
  path: string;
  scopes: readonly string[];
};

export type McpPrincipal = {
  userId: string;
  role: WorkspaceRole;
  scopes: ReadonlySet<string>;
};

export async function handleMcpRoute(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext
): Promise<Response | null> {
  const url = new URL(request.url);
  const profile = mcpProfileForPath(url.pathname);

  if (profile?.metadataPath === url.pathname) {
    return json(
      {
        resource: profileResource(profile, env, request),
        authorization_servers: [authIssuer(env, request)],
        scopes_supported: profile.scopes,
        bearer_methods_supported: ["header"]
      },
      { cache: "public, max-age=300" }
    );
  }

  if (
    url.pathname === "/.well-known/oauth-authorization-server" ||
    url.pathname === "/.well-known/oauth-authorization-server/api/auth"
  ) {
    const auth = createAuth(env, request);
    // The provider endpoint exists at runtime, but the 1.7 RC plugin declaration
    // mismatch prevents Better Auth from carrying it into the inferred API type.
    const metadataAuth = auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0];
    return oauthProviderAuthServerMetadata(metadataAuth, { headers: discoveryHeaders() })(request);
  }
  if (!profile || profile.path !== url.pathname) return null;

  if (request.method === "OPTIONS") {
    const originError = validateOrigin(request);
    return originError ?? new Response(null, { status: 204, headers: mcpHeaders(request) });
  }

  const originError = validateOrigin(request);
  if (originError) return originError;

  try {
    const principal = await authenticateMcp(request, env, profile);
    const response = await serveMcp(request, env, ctx, principal);
    const headers = new Headers(response.headers);
    for (const [name, value] of mcpHeaders(request)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        ...Object.fromEntries(mcpHeaders(request)),
        "www-authenticate": mcpChallenge(profile, env, request)
      }
    });
  }
}

async function authenticateMcp(
  request: Request,
  env: WorkerEnv,
  profile: McpProfile
): Promise<McpPrincipal> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Missing bearer token.");
  const bearer = authorization.slice("Bearer ".length).trim();
  const prefix = "hqb_access_";
  if (!bearer.startsWith(prefix)) throw new Error("Invalid bearer token.");
  const token = bearer.slice(prefix.length);
  if (!token) throw new Error("Invalid bearer token.");

  const row = await env.DB.prepare(
    `SELECT at.userId, at.sessionId, at.scopes, at.resources,
            at.expiresAt AS tokenExpiresAt,
            c.disabled AS clientDisabled, oc.scopes AS consentScopes,
            u.role, u.banned, u.banExpires, s.expiresAt AS sessionExpiresAt
     FROM oauthAccessToken at
     JOIN oauthClient c ON c.clientId = at.clientId
     JOIN oauthConsent oc ON oc.clientId = at.clientId AND oc.userId = at.userId
     JOIN "user" u ON u.id = at.userId
     JOIN "session" s ON s.id = at.sessionId AND s.userId = at.userId
     WHERE at.token = ?`
  )
    .bind(await hashOAuthToken(token))
    .first<{
      userId: string;
      sessionId: string;
      scopes: string;
      resources: string | null;
      consentScopes: string;
      tokenExpiresAt: string;
      sessionExpiresAt: string;
      clientDisabled: number | null;
      role: string | null;
      banned: number | null;
      banExpires: string | null;
    }>();
  const now = new Date();
  if (
    !row ||
    row.clientDisabled === 1 ||
    new Date(row.tokenExpiresAt) <= now ||
    new Date(row.sessionExpiresAt) <= now
  ) {
    throw new Error("Token is inactive.");
  }
  if (row.banned === 1 && (!row.banExpires || new Date(row.banExpires) > now)) {
    throw new Error("User is banned.");
  }
  const parsedRole = workspaceRoleSchema.safeParse(row.role ?? "member");
  if (!parsedRole.success) throw new Error("Invalid workspace role.");
  if (await isPasswordSetupRequired(env.DB, row.userId)) {
    throw new Error("Password setup is required.");
  }

  const expectedResource = profileResource(profile, env, request);
  const tokenResources = parseStoredList(row.resources);
  if (tokenResources.length !== 1 || tokenResources[0] !== expectedResource) {
    throw new Error("Token resource does not match this MCP profile.");
  }

  const consentScopes = new Set(parseStoredList(row.consentScopes));
  const profileScopes = new Set(profile.scopes);
  return {
    userId: row.userId,
    role: parsedRole.data,
    scopes: new Set(
      parseStoredList(row.scopes).filter(
        (scope) => consentScopes.has(scope) && profileScopes.has(scope)
      )
    )
  };
}

function parseStoredList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((scope): scope is string => typeof scope === "string");
    }
  } catch {
    // Older adapters may persist a space-delimited scope value.
  }
  return value.split(" ").filter(Boolean);
}

function mcpProfileForPath(pathname: string): McpProfile | null {
  if (pathname === "/mcp" || pathname === "/.well-known/oauth-protected-resource/mcp") {
    return {
      metadataPath: "/.well-known/oauth-protected-resource/mcp",
      path: "/mcp",
      scopes: ["mail:read"]
    };
  }
  if (pathname === "/mcp/full" || pathname === "/.well-known/oauth-protected-resource/mcp/full") {
    return {
      metadataPath: "/.well-known/oauth-protected-resource/mcp/full",
      path: "/mcp/full",
      scopes: mcpMailScopes
    };
  }
  return null;
}

function profileResource(profile: McpProfile, env: WorkerEnv, request: Request): string {
  return profile.path === "/mcp/full" ? mcpFullResource(env, request) : mcpResource(env, request);
}

function mcpChallenge(profile: McpProfile, env: WorkerEnv, request: Request): string {
  const resourceMetadata = `${authOrigin(env, request)}${profile.metadataPath}`;
  return `Bearer resource_metadata="${resourceMetadata}", scope="${profile.scopes.join(" ")}"`;
}

function validateOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin || origin === new URL(request.url).origin) return null;
  return new Response("Origin is not allowed.", { status: 403, headers: mcpHeaders(request) });
}

function discoveryHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=300",
    "content-type": "application/json"
  };
}

function mcpHeaders(request: Request): Headers {
  const headers = new Headers({
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  const origin = request.headers.get("origin");
  if (origin === new URL(request.url).origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set(
      "access-control-allow-headers",
      "authorization, content-type, mcp-protocol-version"
    );
    headers.set("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    headers.set("vary", "origin");
  }
  return headers;
}

function json(value: unknown, options: { cache: string }): Response {
  return Response.json(value, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": options.cache,
      "x-content-type-options": "nosniff"
    }
  });
}

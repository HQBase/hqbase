import { sql } from "drizzle-orm";

import { getRow } from "../db/drizzle";
import type { WorkerEnv } from "../lib/env";
import type { WorkspaceRole } from "../lib/validation";
import { workspaceRoleSchema } from "../lib/validation";

import { hashOAuthToken } from "./oauth-token";
import { isPasswordSetupRequired } from "./password-setup";

const accessTokenPrefix = "hqb_access_";

export class OAuthBearerError extends Error {
  constructor() {
    super("Bearer token is invalid or inactive.");
    this.name = "OAuthBearerError";
  }
}

export type OAuthPrincipal = {
  clientId: string;
  scopes: ReadonlySet<string>;
  session: {
    id: string;
    userId: string;
    createdAt: Date;
  };
  user: {
    id: string;
    email: string;
    name: string;
    role: WorkspaceRole;
  };
};

export async function authenticateOAuthBearer(
  request: Request,
  env: WorkerEnv,
  options: { allowedScopes: readonly string[]; resource: string }
): Promise<OAuthPrincipal> {
  const bearer = readBearer(request);
  const row = await getRow<OAuthTokenRow>(
    env.DB,
    sql`SELECT at.userId, at.sessionId, at.clientId, at.scopes, at.resources,
            at.expiresAt AS tokenExpiresAt, at.revoked,
            c.disabled AS clientDisabled,
            oc.scopes AS consentScopes, oc.resources AS consentResources,
            u.email, u.name, u.role, u.banned, u.banExpires,
            s.createdAt AS sessionCreatedAt, s.expiresAt AS sessionExpiresAt
     FROM oauthAccessToken at
     JOIN oauthClient c ON c.clientId = at.clientId
     JOIN oauthConsent oc ON oc.clientId = at.clientId AND oc.userId = at.userId
     JOIN "user" u ON u.id = at.userId
     JOIN "session" s ON s.id = at.sessionId AND s.userId = at.userId
     WHERE at.token = ${await hashOAuthToken(bearer.slice(accessTokenPrefix.length))}
     ORDER BY oc.updatedAt DESC
     LIMIT 1`
  );

  const now = Date.now();
  const tokenExpiresAt = Date.parse(row?.tokenExpiresAt ?? "");
  const sessionExpiresAt = Date.parse(row?.sessionExpiresAt ?? "");
  if (
    !row ||
    row.revoked !== null ||
    row.clientDisabled === 1 ||
    !Number.isFinite(tokenExpiresAt) ||
    tokenExpiresAt <= now ||
    !Number.isFinite(sessionExpiresAt) ||
    sessionExpiresAt <= now
  ) {
    throw new OAuthBearerError();
  }
  if (row.banned === 1) {
    const banExpires = Date.parse(row.banExpires ?? "");
    if (!row.banExpires || !Number.isFinite(banExpires) || banExpires > now) {
      throw new OAuthBearerError();
    }
  }
  if (await isPasswordSetupRequired(env.DB, row.userId)) {
    throw new OAuthBearerError();
  }

  const role = workspaceRoleSchema.safeParse(row.role ?? "member");
  const tokenResources = parseStoredList(row.resources);
  const consentResources = parseStoredList(row.consentResources);
  if (
    !role.success ||
    tokenResources.length !== 1 ||
    tokenResources[0] !== options.resource ||
    !consentResources.includes(options.resource)
  ) {
    throw new OAuthBearerError();
  }

  const consentScopes = new Set(parseStoredList(row.consentScopes));
  const allowedScopes = new Set(options.allowedScopes);
  const scopes = new Set(
    parseStoredList(row.scopes).filter(
      (scope) => consentScopes.has(scope) && allowedScopes.has(scope)
    )
  );

  return {
    clientId: row.clientId,
    scopes,
    session: {
      id: row.sessionId,
      userId: row.userId,
      createdAt: new Date(row.sessionCreatedAt)
    },
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      role: role.data
    }
  };
}

function readBearer(request: Request): string {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() ?? "";
  if (!bearer.startsWith(accessTokenPrefix) || bearer.length === accessTokenPrefix.length) {
    throw new OAuthBearerError();
  }
  return bearer;
}

function parseStoredList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Older adapters may persist a space-delimited value.
  }
  return value.split(" ").filter(Boolean);
}

type OAuthTokenRow = {
  userId: string;
  sessionId: string;
  clientId: string;
  scopes: string;
  resources: string | null;
  tokenExpiresAt: string;
  revoked: string | null;
  clientDisabled: number | null;
  consentScopes: string;
  consentResources: string | null;
  email: string;
  name: string;
  role: string | null;
  banned: number | null;
  banExpires: string | null;
  sessionCreatedAt: string;
  sessionExpiresAt: string;
};

import { and, eq, sql } from "drizzle-orm";

import { createDatabase, getRow } from "../db/drizzle";
import { deviceCodes, oauthAccessTokens, oauthConsents, oauthRefreshTokens } from "../db/schema";
import type { WorkerEnv } from "../lib/env";
import { AppError } from "../lib/errors";
import { enforceRateLimit } from "../security/rate-limit";

import { authOrigin } from "./auth";
import { hashOAuthToken } from "./oauth-token";
import { type AuthContext, requireAuthContext } from "./session";

export const deviceCodeGrantType = "urn:ietf:params:oauth:grant-type:device_code";

const accessTokenPrefix = "hqb_access_";
const refreshTokenPrefix = "hqb_refresh_";
const deviceVerificationWindowSeconds = 15 * 60;

type DeviceCodeRow = {
  id: string;
  userCode: string;
  userId: string | null;
  expiresAt: string;
  status: string;
  clientId: string | null;
  oauthClientId: string | null;
  scope: string | null;
  resources: string | null;
  sessionId: string | null;
};

type ConsentRow = {
  id: string;
  scopes: string;
  resources: string | null;
};

type OAuthTokenPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
};

export function enforceDeviceVerificationRateLimit(
  env: WorkerEnv,
  request: Request
): Promise<void> {
  return enforceRateLimit(env.DB, env.BETTER_AUTH_SECRET, {
    scope: "oauth.device.verify.ip",
    subject: request.headers.get("cf-connecting-ip") ?? "unknown",
    limit: 5,
    windowSeconds: deviceVerificationWindowSeconds
  });
}

export async function approveDeviceAuthorization(
  env: WorkerEnv,
  request: Request
): Promise<Response> {
  if (!hasSameOrigin(request, env)) {
    return oauthError(
      403,
      "access_denied",
      "The approval request must come from this HQBase installation."
    );
  }

  let authContext: AuthContext;
  try {
    authContext = await requireAuthContext(env, request);
  } catch (error) {
    if (error instanceof AppError) {
      return oauthError(
        error.status === 401 ? 401 : 403,
        error.status === 401 ? "unauthorized" : "access_denied",
        error.message
      );
    }
    throw error;
  }

  const body = await request
    .clone()
    .json<{ userCode?: unknown }>()
    .catch(() => null);
  if (!body || typeof body.userCode !== "string" || body.userCode.trim().length === 0) {
    return oauthError(400, "invalid_request", "A user code is required.");
  }

  const code = await findDeviceCodeByUserCode(env.DB, body.userCode);
  if (!code) return oauthError(400, "invalid_request", "The user code is invalid.");
  if (Date.parse(code.expiresAt) <= Date.now()) {
    return oauthError(400, "expired_token", "The user code has expired.");
  }
  if (code.status !== "pending") {
    return oauthError(400, "invalid_request", "This device authorization was already processed.");
  }
  if (!code.userId || code.userId !== authContext.user.id) {
    return oauthError(403, "access_denied", "You are not authorized to approve this request.");
  }

  const clientId = code.oauthClientId ?? code.clientId;
  if (!clientId || (code.oauthClientId && code.clientId && code.oauthClientId !== code.clientId)) {
    return oauthError(400, "invalid_request", "The OAuth client could not be verified.");
  }

  await preserveConsent(env.DB, {
    clientId,
    resources: parseStoredList(code.resources),
    scopes: parseScopes(code.scope),
    userId: authContext.user.id
  });

  const approved = await createDatabase(env.DB)
    .update(deviceCodes)
    .set({ status: "approved", sessionId: authContext.session.id })
    .where(
      and(
        eq(deviceCodes.id, code.id),
        eq(deviceCodes.status, "pending"),
        eq(deviceCodes.userId, authContext.user.id)
      )
    )
    .run();
  if (approved.meta.changes !== 1) {
    return oauthError(400, "invalid_request", "This device authorization was already processed.");
  }

  return Response.json(
    { success: true },
    { headers: { "cache-control": "no-store", pragma: "no-cache" } }
  );
}

export async function handleDeviceTokenRequest(
  env: WorkerEnv,
  request: Request,
  handle: () => Promise<Response>
): Promise<Response> {
  const tokenRequest = await readTokenRequest(request);
  if (tokenRequest.grantType !== deviceCodeGrantType) return handle();

  const code = tokenRequest.deviceCode
    ? await getRow<DeviceCodeRow>(
        env.DB,
        sql`SELECT id, userCode, userId, expiresAt, status, clientId, oauthClientId,
                scope, resources, sessionId
         FROM deviceCode
         WHERE deviceCode = ${tokenRequest.deviceCode}`
      )
    : null;

  if (code?.status === "approved") {
    if (!code.userId || !code.sessionId || !(await isActiveSession(env.DB, code))) {
      await createDatabase(env.DB).delete(deviceCodes).where(eq(deviceCodes.id, code.id)).run();
      return oauthError(400, "access_denied", "The approving HQBase session is no longer active.");
    }
  }

  const response = await handle();
  if (!response.ok) return response;

  if (!code?.userId || !code.sessionId) {
    return discardUnboundTokenResponse(
      env.DB,
      response,
      "The device authorization was not bound to an HQBase session."
    );
  }

  const payload = await response
    .clone()
    .json<OAuthTokenPayload>()
    .catch(() => null);
  const accessToken = typeof payload?.access_token === "string" ? payload.access_token : null;
  const refreshToken = typeof payload?.refresh_token === "string" ? payload.refresh_token : null;
  if (!accessToken?.startsWith(accessTokenPrefix)) {
    return discardUnboundTokenResponse(env.DB, response, "The OAuth token response was invalid.");
  }

  const accessTokenHash = await hashOAuthToken(accessToken.slice(accessTokenPrefix.length));
  const clientId = code.oauthClientId ?? code.clientId;
  const database = createDatabase(env.DB);
  const accessUpdate = database
    .update(oauthAccessTokens)
    .set({ sessionId: code.sessionId })
    .where(
      and(
        eq(oauthAccessTokens.token, accessTokenHash),
        eq(oauthAccessTokens.userId, code.userId),
        sql`${oauthAccessTokens.clientId} = ${clientId}`
      )
    );
  const results = refreshToken?.startsWith(refreshTokenPrefix)
    ? await database.batch([
        accessUpdate,
        database
          .update(oauthRefreshTokens)
          .set({ sessionId: code.sessionId })
          .where(
            and(
              eq(
                oauthRefreshTokens.token,
                await hashOAuthToken(refreshToken.slice(refreshTokenPrefix.length))
              ),
              eq(oauthRefreshTokens.userId, code.userId),
              sql`${oauthRefreshTokens.clientId} = ${clientId}`
            )
          )
      ])
    : await database.batch([accessUpdate]);
  if (results.some((result) => result.meta.changes !== 1)) {
    await deleteIssuedTokens(env.DB, accessToken, refreshToken);
    return oauthError(
      500,
      "server_error",
      "The OAuth token could not be bound to the approving session."
    );
  }
  return response;
}

async function readTokenRequest(request: Request): Promise<{
  deviceCode: string | null;
  grantType: string | null;
}> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = await request.clone().formData();
    return {
      deviceCode: stringFormValue(params.get("device_code")),
      grantType: stringFormValue(params.get("grant_type"))
    };
  }
  if (contentType.includes("application/json")) {
    const body = await request
      .clone()
      .json<{ device_code?: unknown; grant_type?: unknown }>()
      .catch(() => null);
    return {
      deviceCode: typeof body?.device_code === "string" ? body.device_code : null,
      grantType: typeof body?.grant_type === "string" ? body.grant_type : null
    };
  }
  return { deviceCode: null, grantType: null };
}

function stringFormValue(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" ? value : null;
}

async function findDeviceCodeByUserCode(
  db: D1Database,
  suppliedCode: string
): Promise<DeviceCodeRow | null> {
  const exact = suppliedCode.trim();
  const normalized = exact.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return getRow<DeviceCodeRow>(
    db,
    sql`SELECT id, userCode, userId, expiresAt, status, clientId, oauthClientId,
              scope, resources, sessionId
       FROM deviceCode
       WHERE userCode = ${exact} OR userCode = ${normalized}
       ORDER BY CASE WHEN userCode = ${exact} THEN 0 ELSE 1 END
       LIMIT 1`
  );
}

async function preserveConsent(
  db: D1Database,
  input: { clientId: string; resources: string[]; scopes: string[]; userId: string }
): Promise<void> {
  const existing = await getRow<ConsentRow>(
    db,
    sql`SELECT id, scopes, resources
       FROM oauthConsent
       WHERE clientId = ${input.clientId} AND userId = ${input.userId}
       ORDER BY updatedAt DESC
       LIMIT 1`
  );
  const scopes = [
    ...new Set([...(existing ? parseStoredList(existing.scopes) : []), ...input.scopes])
  ];
  const resources = [
    ...new Set([...(existing ? parseStoredList(existing.resources) : []), ...input.resources])
  ];
  const now = new Date().toISOString();
  const database = createDatabase(db);

  if (existing) {
    await database
      .update(oauthConsents)
      .set({ scopes: JSON.stringify(scopes), resources: JSON.stringify(resources), updatedAt: now })
      .where(eq(oauthConsents.id, existing.id))
      .run();
    return;
  }

  await database
    .insert(oauthConsents)
    .values({
      id: crypto.randomUUID(),
      clientId: input.clientId,
      userId: input.userId,
      scopes: JSON.stringify(scopes),
      resources: JSON.stringify(resources),
      createdAt: now,
      updatedAt: now
    })
    .run();
}

async function isActiveSession(db: D1Database, code: DeviceCodeRow): Promise<boolean> {
  const row = await getRow<{ id: string }>(
    db,
    sql`SELECT id
       FROM "session"
       WHERE id = ${code.sessionId}
         AND userId = ${code.userId}
         AND expiresAt > ${new Date().toISOString()}`
  );
  return row !== null;
}

async function discardUnboundTokenResponse(
  db: D1Database,
  response: Response,
  description: string
): Promise<Response> {
  const payload = await response
    .clone()
    .json<OAuthTokenPayload>()
    .catch(() => null);
  await deleteIssuedTokens(
    db,
    typeof payload?.access_token === "string" ? payload.access_token : null,
    typeof payload?.refresh_token === "string" ? payload.refresh_token : null
  );
  return oauthError(500, "server_error", description);
}

async function deleteIssuedTokens(
  db: D1Database,
  accessToken: string | null,
  refreshToken: string | null
): Promise<void> {
  const accessTokenHash = accessToken?.startsWith(accessTokenPrefix)
    ? await hashOAuthToken(accessToken.slice(accessTokenPrefix.length))
    : null;
  const refreshTokenHash = refreshToken?.startsWith(refreshTokenPrefix)
    ? await hashOAuthToken(refreshToken.slice(refreshTokenPrefix.length))
    : null;
  const database = createDatabase(db);
  if (accessTokenHash && refreshTokenHash) {
    await database.batch([
      database.delete(oauthAccessTokens).where(eq(oauthAccessTokens.token, accessTokenHash)),
      database.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.token, refreshTokenHash))
    ]);
  } else if (accessTokenHash) {
    await database.delete(oauthAccessTokens).where(eq(oauthAccessTokens.token, accessTokenHash));
  } else if (refreshTokenHash) {
    await database.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.token, refreshTokenHash));
  }
}

function hasSameOrigin(request: Request, env: WorkerEnv): boolean {
  const requestOrigin = request.headers.get("origin");
  return requestOrigin !== null && requestOrigin === authOrigin(env, request);
}

function parseScopes(value: string | null): string[] {
  return value?.split(/\s+/).filter(Boolean) ?? [];
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
  return value.split(/\s+/).filter(Boolean);
}

function oauthError(status: number, error: string, errorDescription: string): Response {
  return Response.json(
    { error, error_description: errorDescription },
    {
      status,
      headers: {
        "cache-control": "no-store",
        pragma: "no-cache"
      }
    }
  );
}

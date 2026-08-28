import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { deviceCodeGrantType } from "../../../worker/auth/device-authorization";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
const apiResource = `${origin}/api/v2`;

let clientId = "";
let ownerCookie = "";
let ownerSessionId = "";
let otherCookie = "";

type OAuthTokenResponse = {
  access_token: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
};

describe("OAuth Device Authorization Grant", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();

    const owner = await signUp("device-owner@login.example", "Device Owner");
    ownerCookie = owner.cookie;
    ownerSessionId = owner.sessionId;
    otherCookie = (await signUp("device-other@login.example", "Other Person")).cookie;

    const metadata = await SELF.fetch(`${origin}/.well-known/oauth-authorization-server/api/auth`);
    expect(metadata.status, await metadata.clone().text()).toBe(200);
    const discovery = (await metadata.json()) as {
      device_authorization_endpoint?: string;
      grant_types_supported?: string[];
      registration_endpoint?: string;
      token_endpoint?: string;
    };
    expect(discovery.device_authorization_endpoint).toBe(`${origin}/api/auth/device/code`);
    expect(discovery.grant_types_supported).toContain(deviceCodeGrantType);
    expect(discovery.token_endpoint).toBe(`${origin}/api/auth/oauth2/token`);

    const registration = await SELF.fetch(discovery.registration_endpoint ?? "", {
      body: JSON.stringify({
        application_type: "native",
        client_name: "HQBase device test client",
        grant_types: [deviceCodeGrantType, "refresh_token"],
        resources: [apiResource],
        scope: "mail:read offline_access",
        token_endpoint_auth_method: "none"
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(registration.status, await registration.clone().text()).toBe(201);
    const registered = (await registration.json()) as {
      client_id?: string;
      redirect_uris?: string[];
    };
    expect(registered.redirect_uris ?? []).toEqual([]);
    if (!registered.client_id) throw new Error("Device OAuth client was not registered.");
    clientId = registered.client_id;
  });

  it("issues a resource-bound token after the owning user approves the short code", async () => {
    const authorization = await requestDeviceCode("mail:read offline_access");

    const pending = await pollToken(authorization.device_code);
    expect(pending.status).toBe(400);
    await expect(pending.json()).resolves.toMatchObject({ error: "authorization_pending" });

    const claimed = await verifyCode(authorization.user_code, ownerCookie);
    expect(claimed).toMatchObject({
      client_id: clientId,
      resource: apiResource,
      scope: "mail:read offline_access",
      status: "pending",
      user_code: authorization.user_code
    });

    const hiddenFromAnotherUser = await verifyCode(authorization.user_code, otherCookie);
    expect(hiddenFromAnotherUser).toEqual({
      status: "pending",
      user_code: authorization.user_code
    });
    const rejectedApproval = await approveCode(authorization.user_code, otherCookie);
    expect(rejectedApproval.status).toBe(403);

    const crossOriginApproval = await SELF.fetch(`${origin}/api/auth/device/approve`, {
      body: JSON.stringify({ userCode: authorization.user_code }),
      headers: { "content-type": "application/json", cookie: ownerCookie },
      method: "POST"
    });
    expect(crossOriginApproval.status).toBe(403);

    const approved = await approveCode(authorization.user_code, ownerCookie);
    expect(approved.status, await approved.clone().text()).toBe(200);
    await expect(approved.json()).resolves.toEqual({ success: true });

    const storedCode = await env.DB.prepare(
      "SELECT status, sessionId FROM deviceCode WHERE deviceCode = ?"
    )
      .bind(authorization.device_code)
      .first<{ sessionId: string | null; status: string }>();
    expect(storedCode).toEqual({ sessionId: ownerSessionId, status: "approved" });

    await env.DB.prepare("UPDATE deviceCode SET lastPolledAt = NULL WHERE deviceCode = ?")
      .bind(authorization.device_code)
      .run();
    const tokenResponse = await pollToken(authorization.device_code);
    expect(tokenResponse.status, await tokenResponse.clone().text()).toBe(200);
    const token = (await tokenResponse.json()) as OAuthTokenResponse;
    expect(token.access_token).toMatch(/^hqb_access_/);
    expect(token.refresh_token).toMatch(/^hqb_refresh_/);
    expect(token.scope?.split(" ")).toEqual(
      expect.arrayContaining(["mail:read", "offline_access"])
    );

    const tokenRows = await env.DB.prepare(
      `SELECT
         (SELECT sessionId FROM oauthAccessToken WHERE userId = u.id ORDER BY createdAt DESC LIMIT 1)
           AS accessSessionId,
         (SELECT sessionId FROM oauthRefreshToken WHERE userId = u.id ORDER BY createdAt DESC LIMIT 1)
           AS refreshSessionId,
         (SELECT COUNT(*) FROM oauthConsent WHERE userId = u.id AND clientId = ?) AS consentCount
       FROM "user" u
       WHERE u.email = ?`
    )
      .bind(clientId, "device-owner@login.example")
      .first<{ accessSessionId: string; refreshSessionId: string; consentCount: number }>();
    expect(tokenRows).toEqual({
      accessSessionId: ownerSessionId,
      refreshSessionId: ownerSessionId,
      consentCount: 1
    });

    const api = await SELF.fetch(`${origin}/api/v2/mailboxes`, {
      headers: { authorization: `Bearer ${token.access_token}` }
    });
    expect(api.status, await api.clone().text()).toBe(200);
    await expect(api.json()).resolves.toEqual([]);

    if (!token.refresh_token) throw new Error("Refresh token was not issued.");
    const rotatedResponse = await refreshToken(token.refresh_token);
    expect(rotatedResponse.status, await rotatedResponse.clone().text()).toBe(200);
    const rotated = (await rotatedResponse.json()) as OAuthTokenResponse;
    expect(rotated.access_token).toMatch(/^hqb_access_/);
    expect(rotated.refresh_token).toMatch(/^hqb_refresh_/);

    const concurrentReplay = await refreshToken(token.refresh_token);
    expect(concurrentReplay.status, await concurrentReplay.clone().text()).toBe(200);
    const replayed = (await concurrentReplay.json()) as OAuthTokenResponse;
    const { expires_in: rotatedExpiresIn, ...rotatedStable } = rotated;
    const { expires_in: replayedExpiresIn, ...replayedStable } = replayed;
    expect(replayedStable).toEqual(rotatedStable);
    expect(replayedExpiresIn).toBeGreaterThan(0);
    expect(replayedExpiresIn).toBeLessThanOrEqual(rotatedExpiresIn);

    await env.DB.prepare(
      `UPDATE oauthRefreshToken
       SET rotationReplayExpiresAt = ?
       WHERE sessionId = ? AND rotatedAt IS NOT NULL`
    )
      .bind("2000-01-01T00:00:00.000Z", ownerSessionId)
      .run();
    const lateReplay = await refreshToken(token.refresh_token);
    expect(lateReplay.status).toBe(400);
    await expect(lateReplay.json()).resolves.toMatchObject({ error: "invalid_grant" });
    if (!rotated.refresh_token) throw new Error("Rotated refresh token was not issued.");
    const invalidatedFamily = await refreshToken(rotated.refresh_token);
    expect(invalidatedFamily.status).toBe(400);
    await expect(invalidatedFamily.json()).resolves.toMatchObject({ error: "invalid_grant" });

    const replay = await pollToken(authorization.device_code);
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({ error: "invalid_grant" });

    await env.DB.prepare('DELETE FROM "session" WHERE id = ?').bind(ownerSessionId).run();
    const afterSessionEnd = await SELF.fetch(`${origin}/api/v2/mailboxes`, {
      headers: { authorization: `Bearer ${token.access_token}` }
    });
    expect(afterSessionEnd.status).toBe(401);
  });

  it("enforces the polling interval and returns a terminal denial", async () => {
    const user = await signUp("device-deny@login.example", "Deny Person");
    const authorization = await requestDeviceCode("mail:read");

    const firstPoll = await pollToken(authorization.device_code);
    expect(firstPoll.status).toBe(400);
    await expect(firstPoll.json()).resolves.toMatchObject({ error: "authorization_pending" });

    const fastPoll = await pollToken(authorization.device_code);
    expect(fastPoll.status).toBe(400);
    await expect(fastPoll.json()).resolves.toMatchObject({ error: "slow_down" });

    await verifyCode(authorization.user_code, user.cookie);
    const denied = await SELF.fetch(`${origin}/api/auth/device/deny`, {
      body: JSON.stringify({ userCode: authorization.user_code }),
      headers: {
        "content-type": "application/json",
        cookie: user.cookie,
        origin
      },
      method: "POST"
    });
    expect(denied.status, await denied.clone().text()).toBe(200);

    await env.DB.prepare("UPDATE deviceCode SET lastPolledAt = NULL WHERE deviceCode = ?")
      .bind(authorization.device_code)
      .run();
    const terminal = await pollToken(authorization.device_code);
    expect(terminal.status).toBe(400);
    await expect(terminal.json()).resolves.toMatchObject({ error: "access_denied" });
  });

  it("expires unused device codes", async () => {
    const authorization = await requestDeviceCode("mail:read");
    await env.DB.prepare("UPDATE deviceCode SET expiresAt = ? WHERE deviceCode = ?")
      .bind(new Date(0).toISOString(), authorization.device_code)
      .run();

    const expired = await pollToken(authorization.device_code);
    expect(expired.status).toBe(400);
    await expect(expired.json()).resolves.toMatchObject({ error: "expired_token" });
  });

  it("persists the device verification limit in D1 without storing the client IP", async () => {
    const connectingIp = "192.0.2.44";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await SELF.fetch(`${origin}/api/auth/device?user_code=INVALID`, {
        headers: { "cf-connecting-ip": connectingIp }
      });
      expect(response.status).toBe(400);
    }

    const limited = await SELF.fetch(`${origin}/api/auth/device?user_code=INVALID`, {
      headers: { "cf-connecting-ip": connectingIp }
    });
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" }
    });

    const stored = await env.DB.prepare(
      `SELECT subject_hash, request_count
       FROM rate_limits
       WHERE scope = 'oauth.device.verify.ip'`
    ).first<{ request_count: number; subject_hash: string }>();
    expect(stored?.request_count).toBe(6);
    expect(stored?.subject_hash).not.toContain(connectingIp);
  });
});

async function signUp(email: string, name: string): Promise<{ cookie: string; sessionId: string }> {
  const response = await createAuth(env, new Request(`${origin}/api/auth/sign-up/email`)).handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({ email, name, password: "device-test-password", rememberMe: false }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    })
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const cookie = extractSessionCookie(response);
  const session = await env.DB.prepare(
    `SELECT s.id
     FROM "session" s JOIN "user" u ON u.id = s.userId
     WHERE u.email = ?
     ORDER BY s.createdAt DESC
     LIMIT 1`
  )
    .bind(email)
    .first<{ id: string }>();
  if (!session) throw new Error("Device test session was not created.");
  return { cookie, sessionId: session.id };
}

async function requestDeviceCode(scope: string): Promise<{
  device_code: string;
  expires_in: number;
  interval: number;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
}> {
  const body = new URLSearchParams({ client_id: clientId, resource: apiResource, scope });
  const response = await SELF.fetch(`${origin}/api/auth/device/code`, {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
  expect(response.status, await response.clone().text()).toBe(200);
  const payload = (await response.json()) as Awaited<ReturnType<typeof requestDeviceCode>>;
  expect(payload.expires_in).toBe(15 * 60);
  expect(payload.interval).toBe(5);
  expect(payload.verification_uri).toBe(`${origin}/device`);
  expect(payload.verification_uri_complete).toBe(
    `${origin}/device?user_code=${encodeURIComponent(payload.user_code)}`
  );
  return payload;
}

function pollToken(deviceCode: string): Promise<Response> {
  return SELF.fetch(`${origin}/api/auth/oauth2/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: deviceCodeGrantType,
      resource: apiResource
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
}

function refreshToken(token: string): Promise<Response> {
  return SELF.fetch(`${origin}/api/auth/oauth2/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: token,
      resource: apiResource
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
}

async function verifyCode(userCode: string, cookie: string): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(
    `${origin}/api/auth/device?user_code=${encodeURIComponent(userCode)}`,
    { headers: { cookie } }
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json<Record<string, unknown>>();
}

function approveCode(userCode: string, cookie: string): Promise<Response> {
  return SELF.fetch(`${origin}/api/auth/device/approve`, {
    body: JSON.stringify({ userCode }),
    headers: { "content-type": "application/json", cookie, origin },
    method: "POST"
  });
}

function extractSessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) throw new Error("Session cookie was not returned.");
  return match[1];
}

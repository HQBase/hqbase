import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { assertSecretSafeAbsent } from "../../helpers/secret-safe-assertions";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
let cookie = "";

describe("personal access token observability", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    const signUp = await createAuth(env, new Request(`${origin}/api/auth/sign-up/email`)).handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "pat-observability@example.com",
          name: "PAT Observability",
          password: "pat-observability-password",
          rememberMe: false
        }),
        headers: { "content-type": "application/json", origin },
        method: "POST"
      })
    );
    expect(signUp.status, await signUp.clone().text()).toBe(200);
    cookie = extractSessionCookie(signUp);
    const user = await env.DB.prepare('SELECT id FROM "user" WHERE email = ?')
      .bind("pat-observability@example.com")
      .first<{ id: string }>();
    if (!user) throw new Error("Expected the observability user.");
    await env.DB.prepare('UPDATE "user" SET role = ? WHERE id = ?').bind("owner", user.id).run();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps PAT lifecycle and authentication logs free of secrets and bodies", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const createRequestBody = JSON.stringify({ name: "Observability PAT", expiresAt: null });

    const created = await SELF.fetch(`${origin}/api/personal-access-tokens`, {
      body: createRequestBody,
      headers: { "content-type": "application/json", cookie, origin },
      method: "POST"
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      personalAccessToken: { id: string };
      token: string;
    };
    expect(/^hqb_pat_[A-Za-z0-9_-]{43}$/u.test(createdBody.token)).toBe(true);
    const serializedCreateResponse = JSON.stringify(createdBody);
    const stored = await env.DB.prepare(
      "SELECT token_hash AS tokenHash FROM personal_access_tokens WHERE id = ?"
    )
      .bind(createdBody.personalAccessToken.id)
      .first<{ tokenHash: string }>();
    if (!stored) throw new Error("Expected the observability PAT row.");
    const authorization = `Bearer ${createdBody.token}`;

    const accepted = await SELF.fetch(`${origin}/api/v1/mailboxes`, {
      headers: { authorization }
    });
    expect(accepted.status).toBe(200);
    const revoked = await SELF.fetch(
      `${origin}/api/personal-access-tokens/${createdBody.personalAccessToken.id}`,
      { headers: { cookie }, method: "DELETE" }
    );
    expect(revoked.status).toBe(204);
    const rejected = await SELF.fetch(`${origin}/api/v1/mailboxes`, {
      headers: { authorization }
    });
    expect(rejected.status).toBe(401);

    assertSecretSafeAbsent(
      [log.mock.calls, info.mock.calls, warn.mock.calls, error.mock.calls],
      [
        createdBody.token,
        stored.tokenHash,
        authorization,
        createRequestBody,
        serializedCreateResponse,
        "synthetic-mail-content-marker"
      ]
    );
  });
});

function extractSessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) throw new Error("Session cookie was not returned.");
  return match[1];
}

import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";

describe("better-auth admin plugin surface", () => {
  it("blocks /api/auth/admin/* before better-auth's own authorization runs", async () => {
    await applyCurrentMigrations();

    // adminRole shares owner's ac statements (worker/auth/access.ts), so
    // better-auth's own admin-plugin authorization alone cannot stop an
    // admin-role caller from reaching set-role, set-user-password, ban-user,
    // etc. The route itself must refuse this prefix. No session cookie is
    // sent here on purpose: the block must apply before any auth check, not
    // depend on the caller's role. The app's own internal admin flows
    // (worker/auth/user-actions.ts) call auth.handler() in-process and never
    // traverse this route, so this block does not affect them; that path is
    // exercised end-to-end by test/integration/worker/users.test.ts.
    const response = await SELF.fetch(`${origin}/api/auth/admin/set-role`, {
      body: JSON.stringify({ role: "owner", userId: "irrelevant" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "FORBIDDEN" }
    });
  });

  it("stops an authenticated admin from promoting themselves to owner", async () => {
    await applyCurrentMigrations();

    // This is the actual escalation the block exists to close: an admin
    // session — not an anonymous caller — reaching better-auth's own
    // set-role endpoint directly. A change that narrowed the block above to
    // unauthenticated requests only would still pass the first test while
    // reopening this one.
    const signUp = await createAuth(env, new Request(`${origin}/api/auth/sign-up/email`)).handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "admin-escalation@login.example",
          name: "Workspace Admin",
          password: "admin-password-123",
          rememberMe: false
        }),
        headers: { "content-type": "application/json", origin },
        method: "POST"
      })
    );
    expect(signUp.status, await signUp.clone().text()).toBe(200);
    const { user } = (await signUp.json()) as { user: { id: string } };
    await env.DB.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ?`).bind(user.id).run();

    const signIn = await SELF.fetch(`${origin}/api/auth/sign-in/email`, {
      body: JSON.stringify({
        email: "admin-escalation@login.example",
        password: "admin-password-123",
        rememberMe: false
      }),
      headers: { "content-type": "application/json", origin },
      method: "POST"
    });
    expect(signIn.status, await signIn.clone().text()).toBe(200);
    const cookie = (signIn.headers.get("set-cookie") ?? "").match(
      /(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/
    )?.[1];
    if (!cookie) throw new Error("Session cookie was not returned.");

    const response = await SELF.fetch(`${origin}/api/auth/admin/set-role`, {
      body: JSON.stringify({ role: "owner", userId: user.id }),
      headers: { "content-type": "application/json", cookie, origin },
      method: "POST"
    });

    expect(response.status).toBe(403);
    const stored = await env.DB.prepare(`SELECT role FROM "user" WHERE id = ?`)
      .bind(user.id)
      .first<{ role: string }>();
    expect(stored?.role).toBe("admin");
  });
});

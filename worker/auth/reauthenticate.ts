import type { WorkerEnv } from "../lib/env";
import { AppError } from "../lib/errors";
import { enforceRateLimit } from "../security/rate-limit";
import { createAuth } from "./auth";

export async function reauthenticateUser(
  env: WorkerEnv,
  request: Request,
  input: { email: string; password: string }
): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  await Promise.all([
    enforceRateLimit(env.DB, env.BETTER_AUTH_SECRET, {
      scope: "auth.email",
      subject: input.email,
      limit: 10,
      windowSeconds: 15 * 60
    }),
    enforceRateLimit(env.DB, env.BETTER_AUTH_SECRET, {
      scope: "auth.ip",
      subject: ip,
      limit: 60,
      windowSeconds: 15 * 60
    })
  ]);

  const url = new URL("/api/auth/sign-in/email", request.url);
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", url.origin);
  const response = await createAuth(env, request).handler(
    new Request(url, {
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        rememberMe: true
      }),
      headers,
      method: "POST"
    })
  );
  if (!response.ok) {
    throw new AppError("REAUTHENTICATION_FAILED", "The password is incorrect. Try again.", 401);
  }
  return response;
}

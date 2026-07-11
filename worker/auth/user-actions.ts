import { z } from "zod";

import type { WorkerEnv } from "../lib/env";
import { AppError } from "../lib/errors";
import type { WorkspaceRole } from "../lib/validation";
import { parseWith } from "../lib/validation";

import { createAuth } from "./auth";

const authUserSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string()
  })
});

type AuthUserResult = z.infer<typeof authUserSchema>["user"];

type CreateAuthUserInput = {
  name: string;
  email: string;
  password: string;
  role: WorkspaceRole;
};

export async function signUpOwnerUser(
  env: WorkerEnv,
  request: Request,
  input: CreateAuthUserInput
): Promise<AuthUserResult> {
  const body = {
    name: input.name,
    email: input.email,
    password: input.password,
    rememberMe: false
  };
  const data = await callAuthJson(env, request, "/api/auth/sign-up/email", body, false);
  const parsed = parseWith(authUserSchema, data);
  await setUserRole(env.DB, parsed.user.id, "owner");
  return parsed.user;
}

export async function createManagedUser(
  env: WorkerEnv,
  request: Request,
  input: CreateAuthUserInput
): Promise<AuthUserResult> {
  const data = await callAuthJson(env, request, "/api/auth/admin/create-user", input, true);
  return parseWith(authUserSchema, data).user;
}

async function callAuthJson(
  env: WorkerEnv,
  request: Request,
  pathname: string,
  body: unknown,
  includeCookie: boolean
): Promise<unknown> {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";

  const headers = new Headers({
    "content-type": "application/json"
  });
  headers.set("origin", url.origin);
  if (includeCookie) {
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.set("cookie", cookie);
    }
  }

  const authResponse = await createAuth(env, request).handler(
    new Request(url, {
      body: JSON.stringify(body),
      headers,
      method: "POST"
    })
  );

  const data = await safeJson(authResponse);
  if (!authResponse.ok) {
    throw new AppError("AUTH_USER_CREATE_FAILED", extractAuthError(data), authResponse.status);
  }
  return data;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractAuthError(data: unknown): string {
  const parsed = z
    .object({
      message: z.string().optional(),
      error: z.string().optional()
    })
    .passthrough()
    .safeParse(data);

  return parsed.success
    ? (parsed.data.message ?? parsed.data.error ?? "Auth request failed.")
    : "Auth request failed.";
}

async function setUserRole(db: D1Database, userId: string, role: WorkspaceRole): Promise<void> {
  await db
    .prepare('UPDATE "user" SET role = ?, updatedAt = ? WHERE id = ?')
    .bind(role, new Date().toISOString(), userId)
    .run();
}

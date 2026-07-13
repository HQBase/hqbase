import { z } from "zod";

import type { WorkerEnv } from "../lib/env";
import { AppError } from "../lib/errors";
import type { WorkspaceRole } from "../lib/validation";
import { parseWith, workspaceRoleSchema } from "../lib/validation";

import { createAuth } from "./auth";

const betterSessionSchema = z.object({
  session: z.object({
    id: z.string(),
    userId: z.string(),
    createdAt: z.coerce.date()
  }),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    role: workspaceRoleSchema.optional().nullable()
  })
});

export type AuthContext = {
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

export async function getAuthContext(
  env: WorkerEnv,
  request: Request
): Promise<AuthContext | null> {
  const auth = createAuth(env, request);
  const rawSession = await auth.api.getSession({
    headers: request.headers
  });

  if (!rawSession) {
    return null;
  }

  const parsed = parseWith(betterSessionSchema, rawSession);
  return {
    session: parsed.session,
    user: {
      id: parsed.user.id,
      email: parsed.user.email,
      name: parsed.user.name,
      role: parsed.user.role ?? "member"
    }
  };
}

export async function requireAuthContext(env: WorkerEnv, request: Request): Promise<AuthContext> {
  const authContext = await getAuthContext(env, request);
  if (!authContext) {
    throw new AppError("UNAUTHENTICATED", "Sign in is required.", 401);
  }
  return authContext;
}

export function requireRole(
  authContext: AuthContext,
  allowed: readonly WorkspaceRole[],
  message = "You do not have permission to perform this action."
): void {
  if (!allowed.includes(authContext.user.role)) {
    throw new AppError("FORBIDDEN", message, 403);
  }
}

export function requireRecentSession(authContext: AuthContext, maxAgeMs = 10 * 60 * 1000): void {
  if (Date.now() - authContext.session.createdAt.getTime() > maxAgeMs) {
    throw new AppError(
      "RECENT_AUTH_REQUIRED",
      "Sign in again before changing workspace infrastructure.",
      403
    );
  }
}

import type { WorkerEnv } from "../lib/env";
import { AppError, errorBody } from "../lib/errors";

import { authOrigin, mailApiResource } from "./auth";
import { authenticateOAuthBearer, OAuthBearerError } from "./oauth-principal";
import { type AuthContext, requireAuthContext } from "./session";

const mailApiScopes = ["mail:read", "mail:write", "mail:send"] as const;
export type MailApiScope = (typeof mailApiScopes)[number];
const retiredMailApiMetadataPath = "/.well-known/oauth-protected-resource/api/v1";
const mailApiMetadataPath = "/.well-known/oauth-protected-resource/api/v2";
const agentSkillPath = "/skills/hqbase-mail/SKILL.md";

export type MailApiPrincipal = {
  auth: AuthContext;
  authentication: "bearer" | "session";
  scopes: ReadonlySet<MailApiScope>;
};

export class MailApiAuthError extends AppError {
  readonly authError: "invalid_token" | "insufficient_scope" | null;
  readonly requiredScope: MailApiScope;

  constructor(
    code: string,
    message: string,
    status: 401 | 403,
    requiredScope: MailApiScope,
    authError: "invalid_token" | "insufficient_scope" | null
  ) {
    super(code, message, status);
    this.name = "MailApiAuthError";
    this.authError = authError;
    this.requiredScope = requiredScope;
  }
}

export async function requireMailApiContext(
  env: WorkerEnv,
  request: Request,
  requiredScope: MailApiScope
): Promise<AuthContext> {
  return (await requireMailApiPrincipal(env, request, requiredScope)).auth;
}

export async function requireMailApiPrincipal(
  env: WorkerEnv,
  request: Request,
  requiredScope: MailApiScope
): Promise<MailApiPrincipal> {
  if (!isVersionedMailApiRequest(request)) {
    return {
      auth: await requireAuthContext(env, request),
      authentication: "session",
      scopes: new Set(mailApiScopes)
    };
  }

  if (!request.headers.has("authorization")) {
    try {
      return {
        auth: await requireAuthContext(env, request),
        authentication: "session",
        scopes: new Set(mailApiScopes)
      };
    } catch (error) {
      if (error instanceof AppError && error.status === 401) {
        throw new MailApiAuthError(
          "UNAUTHENTICATED",
          "A session cookie or bearer token is required.",
          401,
          requiredScope,
          null
        );
      }
      throw error;
    }
  }

  try {
    const principal = await authenticateOAuthBearer(request, env, {
      allowedScopes: mailApiScopes,
      resource: mailApiResource(env, request)
    });
    if (!principal.scopes.has(requiredScope)) {
      throw new MailApiAuthError(
        "INSUFFICIENT_SCOPE",
        `The ${requiredScope} permission is required.`,
        403,
        requiredScope,
        "insufficient_scope"
      );
    }
    return {
      auth: { session: principal.session, user: principal.user },
      authentication: "bearer",
      scopes: new Set(
        [...principal.scopes].filter((scope): scope is MailApiScope =>
          mailApiScopes.includes(scope as MailApiScope)
        )
      )
    };
  } catch (error) {
    if (error instanceof MailApiAuthError) throw error;
    if (error instanceof OAuthBearerError) {
      throw new MailApiAuthError(
        "INVALID_OAUTH_TOKEN",
        "Bearer token is invalid or inactive.",
        401,
        requiredScope,
        "invalid_token"
      );
    }
    throw error;
  }
}

export function isVersionedMailApiRequest(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return pathname === "/api/v2" || pathname.startsWith("/api/v2/");
}

export function mailApiChallenge(
  env: WorkerEnv,
  request: Request,
  error: MailApiAuthError
): string {
  const parameters = [
    `resource_metadata="${authOrigin(env, request)}${mailApiMetadataPath}"`,
    `scope="${error.requiredScope}"`
  ];
  if (error.authError) parameters.push(`error="${error.authError}"`);
  return `Bearer ${parameters.join(", ")}`;
}

export function handleMailApiMetadata(request: Request, env: WorkerEnv): Response | null {
  const pathname = new URL(request.url).pathname;
  if (pathname === retiredMailApiMetadataPath) {
    return Response.json(errorBody("NOT_FOUND", "Mail API v1 is no longer available."), {
      status: 404,
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  }
  if (pathname !== mailApiMetadataPath) return null;
  const origin = authOrigin(env, request);
  return Response.json(
    {
      resource: mailApiResource(env, request),
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: mailApiScopes,
      bearer_methods_supported: ["header"],
      resource_name: "HQBase Mail API",
      resource_documentation: `${origin}${agentSkillPath}`
    },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff"
      }
    }
  );
}

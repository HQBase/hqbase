import type { WorkerEnv } from "../lib/env";
import { AppError } from "../lib/errors";
import type { WorkspaceRole } from "../lib/validation";

import { authOrigin, mailApiResource } from "./auth";
import { authenticateOAuthBearer, OAuthBearerError } from "./oauth-principal";
import {
  authenticatePersonalAccessToken,
  PersonalAccessTokenError
} from "./personal-access-token-principal";
import { type AuthContext, requireAuthContext } from "./session";

export const mailApiScopes = ["mail:read", "mail:write", "mail:send"] as const;
export type MailApiScope = (typeof mailApiScopes)[number];
export const mailApiMetadataPath = "/.well-known/oauth-protected-resource/api/v1";
const agentSkillPath = "/skills/hqbase-mail/SKILL.md";

export type MailApiContext = {
  authentication:
    | { kind: "session"; id: string }
    | { kind: "oauth"; clientId: string }
    | { kind: "pat"; tokenId: string };
  user: { id: string; email: string; name: string; role: WorkspaceRole };
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
): Promise<MailApiContext> {
  if (!isVersionedMailApiRequest(request)) {
    return sessionMailApiContext(await requireAuthContext(env, request));
  }

  if (!request.headers.has("authorization")) {
    try {
      return sessionMailApiContext(await requireAuthContext(env, request));
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

  const bearer = readMailApiBearerValue(request);
  if (bearer?.startsWith("hqb_pat_")) {
    try {
      const principal = await authenticatePersonalAccessToken(env.DB, bearer);
      return {
        authentication: { kind: "pat", tokenId: principal.tokenId },
        user: principal.user
      };
    } catch (error) {
      if (error instanceof PersonalAccessTokenError) {
        throw new MailApiAuthError(
          "INVALID_PERSONAL_ACCESS_TOKEN",
          "Bearer token is invalid or inactive.",
          401,
          requiredScope,
          "invalid_token"
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
      authentication: { kind: "oauth", clientId: principal.clientId },
      user: principal.user
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

export function readMailApiBearerValue(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  return authorization?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() ?? null;
}

export function mailApiAuditMetadata(
  context: MailApiContext
): { authenticationKind: "pat"; personalAccessTokenId: string } | undefined {
  return context.authentication.kind === "pat"
    ? {
        authenticationKind: "pat",
        personalAccessTokenId: context.authentication.tokenId
      }
    : undefined;
}

export function isVersionedMailApiRequest(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
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
  if (new URL(request.url).pathname !== mailApiMetadataPath) return null;
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

function sessionMailApiContext(auth: AuthContext): MailApiContext {
  return {
    authentication: { kind: "session", id: auth.session.id },
    user: auth.user
  };
}

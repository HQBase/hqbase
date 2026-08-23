import type { WorkerEnv } from "../lib/env";
import { AppError } from "../lib/errors";

import {
  AgentBearerError,
  agentCredentialPrefix,
  authenticateAgentBearer
} from "./agent-credential";
import { authOrigin, mailApiResource } from "./auth";
import { authenticateOAuthBearer, OAuthBearerError } from "./oauth-principal";
import { type AgentPrincipal, type HumanPrincipal, humanPrincipal } from "./principal";
import { type AuthContext, requireAuthContext } from "./session";

const mailApiScopes = ["mail:read", "mail:write", "mail:send"] as const;
export type MailApiScope = (typeof mailApiScopes)[number];
const mailApiMetadataPath = "/.well-known/oauth-protected-resource/api/v1";
const agentSkillPath = "/skills/hqbase-mail/SKILL.md";

export type MailApiPrincipal =
  | {
      principal: HumanPrincipal;
      auth: AuthContext;
      authentication: "bearer" | "session";
      scopes: ReadonlySet<MailApiScope>;
    }
  | {
      principal: AgentPrincipal;
      auth: null;
      authentication: "agent";
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
  const result = await requireMailApiPrincipal(env, request, requiredScope);
  if (result.auth) return result.auth;
  throw new MailApiAuthError(
    "AGENT_PRINCIPAL_NOT_SUPPORTED",
    "This endpoint does not accept a machine agent credential.",
    403,
    requiredScope,
    null
  );
}

export async function requireMailApiPrincipal(
  env: WorkerEnv,
  request: Request,
  requiredScope: MailApiScope
): Promise<MailApiPrincipal> {
  if (!isVersionedMailApiRequest(request)) {
    const auth = await requireAuthContext(env, request);
    return {
      principal: humanPrincipal(auth),
      auth,
      authentication: "session",
      scopes: new Set(mailApiScopes)
    };
  }

  if (!request.headers.has("authorization")) {
    try {
      const auth = await requireAuthContext(env, request);
      return {
        principal: humanPrincipal(auth),
        auth,
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

  if (isAgentBearer(request)) {
    try {
      const result = await authenticateAgentBearer(request, env, {
        allowedScopes: mailApiScopes,
        resource: "mail"
      });
      if (!result.scopes.has(requiredScope)) {
        throw new MailApiAuthError(
          "INSUFFICIENT_SCOPE",
          `The ${requiredScope} permission is required.`,
          403,
          requiredScope,
          "insufficient_scope"
        );
      }
      return {
        principal: result.principal,
        auth: null,
        authentication: "agent",
        scopes: mailScopes(result.scopes)
      };
    } catch (error) {
      if (error instanceof MailApiAuthError) throw error;
      if (error instanceof AgentBearerError) {
        throw new MailApiAuthError(
          "INVALID_AGENT_CREDENTIAL",
          "Agent bearer credential is invalid or inactive.",
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
    const auth = { session: principal.session, user: principal.user };
    return {
      principal: humanPrincipal(auth),
      auth,
      authentication: "bearer",
      scopes: mailScopes(principal.scopes)
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

function isAgentBearer(request: Request): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  return (
    authorization
      .match(/^Bearer\s+(.+)$/iu)?.[1]
      ?.trim()
      .startsWith(agentCredentialPrefix) ?? false
  );
}

function mailScopes(scopes: ReadonlySet<string>): ReadonlySet<MailApiScope> {
  return new Set(
    [...scopes].filter((scope): scope is MailApiScope =>
      mailApiScopes.includes(scope as MailApiScope)
    )
  );
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

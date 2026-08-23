import { sql } from "drizzle-orm";

import { getRow } from "../db/drizzle";
import type { WorkerEnv } from "../lib/env";

import { hashOAuthToken } from "./oauth-token";
import type { AgentPrincipal } from "./principal";

export const agentCredentialPrefix = "hqb_agent_";
const secretBytes = 32;

export type AgentCredentialResource = "mail" | "management";

export type AgentCredentialPrincipal = {
  principal: AgentPrincipal;
  credentialId: string;
  resource: AgentCredentialResource;
  scopes: ReadonlySet<string>;
};

export class AgentBearerError extends Error {
  constructor() {
    super("Agent bearer credential is invalid or inactive.");
    this.name = "AgentBearerError";
  }
}

export async function createAgentCredential(): Promise<{
  token: string;
  secretHash: string;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(secretBytes));
  const secret = base64Url(bytes);
  return {
    token: `${agentCredentialPrefix}${secret}`,
    secretHash: await hashAgentCredentialSecret(secret)
  };
}

export function hashAgentCredentialSecret(secret: string): Promise<string> {
  return hashOAuthToken(secret);
}

export async function authenticateAgentBearer(
  request: Request,
  env: WorkerEnv,
  options: {
    resource: AgentCredentialResource;
    allowedScopes: readonly string[];
  }
): Promise<AgentCredentialPrincipal> {
  const secret = readAgentBearer(request);
  const row = await getRow<AgentCredentialRow>(
    env.DB,
    sql`SELECT credential.id AS credentialId, credential.resource,
               credential.scopes_json AS scopesJson, credential.expires_at AS expiresAt,
               principal.id AS principalId, principal.name, principal.status,
               agent.profile
        FROM agent_credentials credential
        JOIN principals principal
          ON principal.id = credential.principal_id AND principal.type = 'agent'
        JOIN agents agent ON agent.principal_id = principal.id
        WHERE credential.secret_hash = ${await hashAgentCredentialSecret(secret)}
          AND credential.revoked_at IS NULL
        LIMIT 1`
  );

  if (row?.status !== "active" || row.resource !== options.resource) {
    throw new AgentBearerError();
  }
  if (
    (options.resource === "mail" && row.profile !== "mailbox") ||
    (options.resource === "management" && row.profile !== "provisioner")
  ) {
    throw new AgentBearerError();
  }
  if (row.expiresAt !== null) {
    const expiresAt = Date.parse(row.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new AgentBearerError();
    }
  }

  const storedScopes = parseScopes(row.scopesJson);
  if (!storedScopes) throw new AgentBearerError();
  const allowedScopes = new Set(options.allowedScopes);
  const scopes = new Set(storedScopes.filter((scope) => allowedScopes.has(scope)));

  return {
    principal: {
      id: row.principalId,
      type: "agent",
      name: row.name,
      role: null,
      profile: row.profile
    },
    credentialId: row.credentialId,
    resource: row.resource,
    scopes
  };
}

function readAgentBearer(request: Request): string {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() ?? "";
  if (!bearer.startsWith(agentCredentialPrefix) || bearer.length === agentCredentialPrefix.length) {
    throw new AgentBearerError();
  }
  return bearer.slice(agentCredentialPrefix.length);
}

function parseScopes(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) return null;
    return parsed;
  } catch {
    return null;
  }
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

type AgentCredentialRow = {
  credentialId: string;
  resource: AgentCredentialResource;
  scopesJson: string;
  expiresAt: string | null;
  principalId: string;
  name: string;
  status: "active" | "disabled";
  profile: "mailbox" | "provisioner";
};

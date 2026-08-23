import {
  AgentBearerError,
  authenticateAgentBearer,
  createAgentCredential,
  hashAgentCredentialSecret
} from "@worker/auth/agent-credential";
import type { WorkerEnv } from "@worker/lib/env";
import { describe, expect, it } from "vitest";

const token = "hqb_agent_test-secret";

describe("agent credential generation", () => {
  it("creates a different high-entropy credential and hash each time", async () => {
    const first = await createAgentCredential();
    const second = await createAgentCredential();

    expect(first.token).toMatch(/^hqb_agent_[A-Za-z0-9_-]{43}$/u);
    expect(second.token).toMatch(/^hqb_agent_[A-Za-z0-9_-]{43}$/u);
    expect(first.token).not.toBe(second.token);
    expect(first.secretHash).not.toBe(second.secretHash);
    expect(first.secretHash).toBe(
      await hashAgentCredentialSecret(first.token.slice("hqb_agent_".length))
    );
    expect(first.secretHash).not.toContain(first.token);
  });
});

describe("agent bearer authentication", () => {
  it("returns an active mailbox principal with intersected mail scopes", async () => {
    const { env, parameters } = environment({
      credentialId: "cred_1",
      resource: "mail",
      scopesJson: '["mail:read","mail:send","unknown"]',
      expiresAt: null,
      principalId: "agt_1",
      name: "Mailbox Agent",
      status: "active",
      profile: "mailbox"
    });

    const result = await authenticateAgentBearer(bearerRequest(token), env, {
      resource: "mail",
      allowedScopes: ["mail:read", "mail:write"]
    });

    expect(result).toMatchObject({
      credentialId: "cred_1",
      resource: "mail",
      principal: {
        id: "agt_1",
        type: "agent",
        name: "Mailbox Agent",
        role: null,
        profile: "mailbox"
      }
    });
    expect([...result.scopes]).toEqual(["mail:read"]);
    expect(parameters).toEqual([await hashAgentCredentialSecret("test-secret")]);
  });

  it("rejects the wrong audience or agent profile", async () => {
    const mailRow = activeRow();
    await expect(
      authenticateAgentBearer(bearerRequest(token), environment(mailRow).env, {
        resource: "management",
        allowedScopes: ["mailbox:provision"]
      })
    ).rejects.toBeInstanceOf(AgentBearerError);

    await expect(
      authenticateAgentBearer(
        bearerRequest(token),
        environment({ ...mailRow, resource: "management", profile: "mailbox" }).env,
        { resource: "management", allowedScopes: ["mailbox:provision"] }
      )
    ).rejects.toBeInstanceOf(AgentBearerError);
  });

  it("rejects revoked, disabled, expired, and malformed credentials", async () => {
    await expect(
      authenticateAgentBearer(bearerRequest(token), environment(null).env, {
        resource: "mail",
        allowedScopes: ["mail:read"]
      })
    ).rejects.toBeInstanceOf(AgentBearerError);
    await expect(
      authenticateAgentBearer(
        bearerRequest(token),
        environment({ ...activeRow(), status: "disabled" }).env,
        { resource: "mail", allowedScopes: ["mail:read"] }
      )
    ).rejects.toBeInstanceOf(AgentBearerError);
    await expect(
      authenticateAgentBearer(
        bearerRequest(token),
        environment({ ...activeRow(), expiresAt: "2020-01-01T00:00:00.000Z" }).env,
        { resource: "mail", allowedScopes: ["mail:read"] }
      )
    ).rejects.toBeInstanceOf(AgentBearerError);
    await expect(
      authenticateAgentBearer(
        new Request("https://hqbase.test/api/v1"),
        environment(activeRow()).env,
        {
          resource: "mail",
          allowedScopes: ["mail:read"]
        }
      )
    ).rejects.toBeInstanceOf(AgentBearerError);
  });
});

function bearerRequest(value: string): Request {
  return new Request("https://hqbase.test/api/v1/messages", {
    headers: { authorization: `Bearer ${value}` }
  });
}

function activeRow(): AgentCredentialRow {
  return {
    credentialId: "cred_1",
    resource: "mail",
    scopesJson: '["mail:read"]',
    expiresAt: null,
    principalId: "agt_1",
    name: "Mailbox Agent",
    status: "active",
    profile: "mailbox"
  };
}

function environment(row: AgentCredentialRow | null): {
  env: WorkerEnv;
  parameters: unknown[];
} {
  const parameters: unknown[] = [];
  const statement = {
    bind(...values: unknown[]) {
      parameters.push(...values);
      return statement;
    },
    async all() {
      return { results: row ? [row] : [] };
    }
  };
  return {
    env: {
      DB: {
        prepare() {
          return statement;
        }
      } as unknown as D1Database
    } as WorkerEnv,
    parameters
  };
}

type AgentCredentialRow = {
  credentialId: string;
  resource: "mail" | "management";
  scopesJson: string;
  expiresAt: string | null;
  principalId: string;
  name: string;
  status: "active" | "disabled";
  profile: "mailbox" | "provisioner";
};

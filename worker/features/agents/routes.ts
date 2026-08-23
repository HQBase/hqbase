import { type Context, Hono } from "hono";

import { AgentBearerError, authenticateAgentBearer } from "../../auth/agent-credential";
import { requireAuthContext, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { enforceRateLimit } from "../../security/rate-limit";
import { ignoreMailEventFailure, publishMailboxMailEvent } from "../events/service";
import { deprovisionAgentMailbox } from "../mailboxes/lifecycle-service";
import {
  rotateAgentCredential,
  rotateProvisionedAgentCredential,
  setAgentActive
} from "./credential-service";
import { listAgents, listAgentsCreatedBy } from "./queries";
import { createAgentForHuman, createAgentForProvisioner } from "./service";
import type { AgentMutationResult } from "./types";
import { createAgentSchema, updateAgentSchema } from "./validation";

export const agentManagementRoutes = new Hono<HonoApp>();

agentManagementRoutes.get("/", async (c) => {
  if (c.req.header("authorization")) {
    const provisioner = await requireProvisioner(c);
    return c.json({ agents: await listAgentsCreatedBy(c.env.DB, provisioner.id) });
  }
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json({ agents: await listAgents(c.env.DB) });
});

agentManagementRoutes.post("/", async (c) => {
  let result: AgentMutationResult;

  if (c.req.header("authorization")) {
    const principal = await requireProvisioner(c);
    const input = parseWith(createAgentSchema, await readJson(c.req.raw));
    if (input.profile !== "mailbox") {
      throw new AppError(
        "PROVISIONER_CHILD_FORBIDDEN",
        "A provisioner can create mailbox agents only.",
        403
      );
    }
    await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
      scope: "agent.provision",
      subject: principal.id,
      limit: 60,
      windowSeconds: 60 * 60
    });
    result = await createAgentForProvisioner(c.env.DB, input, principal.id, c.get("correlationId"));
  } else {
    const auth = await requireAuthContext(c.env, c.req.raw);
    requireRole(auth, ["owner", "admin"]);
    const input = parseWith(createAgentSchema, await readJson(c.req.raw));
    result = await createAgentForHuman(c.env.DB, input, auth.user.id, c.get("correlationId"));
  }
  if (result.agent.mailbox) {
    c.executionCtx.waitUntil(
      ignoreMailEventFailure(publishMailboxMailEvent(c.env, result.agent.mailbox.id))
    );
  }
  return c.json(result, 201);
});

agentManagementRoutes.patch("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const input = parseWith(updateAgentSchema, await readJson(c.req.raw));
  const result = await setAgentActive(c.env.DB, c.req.param("id"), input.isActive, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: input.isActive ? "agent.enable" : "agent.disable",
    resourceType: "agent",
    resourceId: c.req.param("id"),
    outcome: "success"
  });
  return c.json(result);
});

agentManagementRoutes.post("/:id/credential", async (c) => {
  const agentId = c.req.param("id");
  let result: AgentMutationResult;
  if (c.req.header("authorization")) {
    const provisioner = await requireProvisioner(c);
    await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
      scope: "agent.credential.reissue",
      subject: provisioner.id,
      limit: 60,
      windowSeconds: 60 * 60
    });
    result = await rotateProvisionedAgentCredential(c.env.DB, agentId, provisioner.id, {
      correlationId: c.get("correlationId"),
      actorType: "agent",
      actorId: provisioner.id,
      action: "agent.credential.reissue",
      resourceType: "agent",
      resourceId: agentId,
      outcome: "success"
    });
  } else {
    const auth = await requireAuthContext(c.env, c.req.raw);
    requireRole(auth, ["owner", "admin"]);
    result = await rotateAgentCredential(c.env.DB, agentId, {
      correlationId: c.get("correlationId"),
      actorType: "user",
      actorId: auth.user.id,
      action: "agent.credential.rotate",
      resourceType: "agent",
      resourceId: agentId,
      outcome: "success"
    });
  }
  return c.json(result, 201);
});

agentManagementRoutes.delete("/:id", async (c) => {
  const provisioner = await requireProvisioner(c);
  const agentId = c.req.param("id");
  await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
    scope: "agent.deprovision",
    subject: provisioner.id,
    limit: 60,
    windowSeconds: 60 * 60
  });
  const agent = await deprovisionAgentMailbox(c.env.DB, agentId, provisioner.id, {
    correlationId: c.get("correlationId"),
    actorType: "agent",
    actorId: provisioner.id,
    action: "mailbox.deprovision",
    resourceType: "agent",
    resourceId: agentId,
    outcome: "success"
  });
  if (agent.mailbox) {
    c.executionCtx.waitUntil(
      ignoreMailEventFailure(publishMailboxMailEvent(c.env, agent.mailbox.id))
    );
  }
  return c.json({ agent });
});

async function requireProvisioner(c: Context<HonoApp>) {
  try {
    const credential = await authenticateAgentBearer(c.req.raw, c.env, {
      resource: "management",
      allowedScopes: ["mailbox:provision"]
    });
    if (
      credential.principal.profile !== "provisioner" ||
      !credential.scopes.has("mailbox:provision")
    ) {
      throw new AppError(
        "PROVISIONER_FORBIDDEN",
        "The mailbox:provision permission is required.",
        403
      );
    }
    return credential.principal;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof AgentBearerError) {
      throw new AppError(
        "INVALID_AGENT_CREDENTIAL",
        "Agent credential is invalid or inactive.",
        401
      );
    }
    throw error;
  }
}

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgent,
  listAgents,
  rotateAgentCredential,
  setAgentActive
} from "@/features/agents/api";
import type { ManagedAgent } from "@/features/agents/types";

const agent: ManagedAgent = {
  id: "agt_support",
  name: "Support assistant",
  profile: "mailbox",
  isActive: true,
  accessLevel: "read",
  mailbox: {
    id: "mbx_support",
    address: "support@example.com",
    displayName: "Support",
    isDeleted: false
  },
  createdAt: "2026-08-23T12:00:00.000Z",
  updatedAt: "2026-08-23T12:00:00.000Z"
};

afterEach(() => vi.unstubAllGlobals());

describe("agent management API", () => {
  it("lists agents from the management API", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ agents: [agent] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAgents()).resolves.toEqual([agent]);
    expect(fetchMock).toHaveBeenCalledWith("/management/v1/agents", {
      credentials: "include",
      method: "GET"
    });
  });

  it("creates mailbox agents with an exact mailbox request", async () => {
    const result = { agent, credential: "hqb_agent_secret" };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(result));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createAgent({
        profile: "mailbox",
        name: "Support assistant",
        accessLevel: "read",
        mailbox: { address: "support@example.com", displayName: "Support" }
      })
    ).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith("/management/v1/agents", {
      body: JSON.stringify({
        profile: "mailbox",
        name: "Support assistant",
        accessLevel: "read",
        mailbox: { address: "support@example.com", displayName: "Support" }
      }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST"
    });
  });

  it("uses separate status and credential operations", async () => {
    const disabled = { ...agent, isActive: false };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ agent: disabled }))
      .mockResolvedValueOnce(Response.json({ agent, credential: "hqb_agent_rotated" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(setAgentActive(agent.id, false)).resolves.toEqual({ agent: disabled });
    await expect(rotateAgentCredential(agent.id)).resolves.toEqual({
      agent,
      credential: "hqb_agent_rotated"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/management/v1/agents/agt_support", {
      body: JSON.stringify({ isActive: false }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "PATCH"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/management/v1/agents/agt_support/credential", {
      credentials: "include",
      method: "POST"
    });
  });
});

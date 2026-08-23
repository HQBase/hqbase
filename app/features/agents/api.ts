import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type {
  AgentCredentialResult,
  AgentMutationResult,
  CreateAgentInput,
  ManagedAgent
} from "./types";

const agentsPath = "/management/v1/agents";

export async function listAgents(): Promise<ManagedAgent[]> {
  return (await apiGet<{ agents: ManagedAgent[] }>(agentsPath)).agents;
}

export function createAgent(input: CreateAgentInput): Promise<AgentCredentialResult> {
  return apiPost<AgentCredentialResult>(agentsPath, input);
}

export function setAgentActive(id: string, isActive: boolean): Promise<AgentMutationResult> {
  return apiPatch<AgentMutationResult>(`${agentsPath}/${id}`, { isActive });
}

export function rotateAgentCredential(id: string): Promise<AgentCredentialResult> {
  return apiPost<AgentCredentialResult>(`${agentsPath}/${id}/credential`);
}

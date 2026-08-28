import { apiDelete, apiGet } from "@/lib/api-client";

export type OAuthConnection = {
  clientId: string;
  name: string;
  scopes: string[];
  resources: string[];
  createdAt: string;
  updatedAt: string;
};

const connectionsPath = "/api/oauth-connections";

export async function listOAuthConnections(): Promise<OAuthConnection[]> {
  return (await apiGet<{ connections: OAuthConnection[] }>(connectionsPath)).connections;
}

export function revokeOAuthConnection(clientId: string): Promise<void> {
  return apiDelete(`${connectionsPath}/${encodeURIComponent(clientId)}`);
}

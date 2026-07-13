import { apiGet, apiPost } from "@/lib/api-client";
import type {
  BootstrapSetupInput,
  CloudflareConfigureResult,
  CloudflareDomainStatus,
  CloudflareTokenStatus,
  CloudflareZone,
  SetupStatus
} from "./types";

export async function getSetupStatus(): Promise<SetupStatus> {
  return apiGet<SetupStatus>("/api/setup/status");
}

export async function bootstrapSetup(input: BootstrapSetupInput): Promise<void> {
  await apiPost("/api/setup/bootstrap", input);
}

export async function verifyCloudflareToken(apiToken: string): Promise<CloudflareTokenStatus> {
  return apiPost<CloudflareTokenStatus>("/api/setup/cloudflare/token", { apiToken });
}

export async function getCloudflareOAuthStatus(): Promise<{ connected: boolean }> {
  return apiGet<{ connected: boolean }>("/api/setup/cloudflare/oauth/status");
}

export async function listCloudflareZones(apiToken?: string): Promise<CloudflareZone[]> {
  const response = await apiPost<{ zones: CloudflareZone[] }>("/api/setup/cloudflare/zones", {
    apiToken
  });
  return response.zones;
}

export async function inspectCloudflareDomain(input: {
  apiToken?: string;
  workerName: string;
  zoneId: string;
}): Promise<CloudflareDomainStatus> {
  return apiPost<CloudflareDomainStatus>("/api/setup/cloudflare/inspect", input);
}

export async function configureCloudflareDomain(input: {
  appHostname?: string;
  attachCustomDomain: boolean;
  apiToken?: string;
  enableSending: boolean;
  workerName: string;
  zoneId: string;
}): Promise<CloudflareConfigureResult> {
  return apiPost<CloudflareConfigureResult>("/api/setup/cloudflare/configure", input);
}

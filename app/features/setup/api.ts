import { apiGet, apiPost } from "@/lib/api-client";
import type {
  BootstrapSetupInput,
  CloudflareAccessStatus,
  CloudflareConfigureResult,
  CloudflareDomainStatus,
  CloudflareZone,
  SetupStatus
} from "./types";

export async function getSetupStatus(): Promise<SetupStatus> {
  return apiGet<SetupStatus>("/api/setup/status");
}

export async function bootstrapSetup(input: BootstrapSetupInput): Promise<void> {
  await apiPost("/api/setup/bootstrap", input);
}

export async function verifyCloudflareAccess(): Promise<CloudflareAccessStatus> {
  return apiPost<CloudflareAccessStatus>("/api/setup/cloudflare/access", {});
}

export async function listCloudflareZones(): Promise<CloudflareZone[]> {
  const response = await apiPost<{ zones: CloudflareZone[] }>("/api/setup/cloudflare/zones", {});
  return response.zones;
}

export async function inspectCloudflareDomain(input: {
  workerName: string;
  zoneId: string;
}): Promise<CloudflareDomainStatus> {
  return apiPost<CloudflareDomainStatus>("/api/setup/cloudflare/inspect", input);
}

export async function configureCloudflareDomain(input: {
  appHostname?: string;
  attachCustomDomain: boolean;
  enableSending: boolean;
  workerName: string;
  zoneId: string;
}): Promise<CloudflareConfigureResult> {
  return apiPost<CloudflareConfigureResult>("/api/setup/cloudflare/configure", input);
}

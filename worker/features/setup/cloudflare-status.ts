import { z } from "zod";

import { safeCloudflareRequest } from "./cloudflare-api";
import type {
  CloudflareCatchAllStatus,
  CloudflareRoutingStatus,
  CloudflareSendingStatus
} from "./types";

const routingSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  status: z.string().nullable().optional()
});

const routingDnsSchema = z
  .union([
    z.array(
      z
        .object({
          content: z.string(),
          name: z.string(),
          priority: z.number().optional(),
          ttl: z.number().optional(),
          type: z.string()
        })
        .passthrough()
    ),
    z.object({ errors: z.array(z.unknown()).optional() })
  ])
  .nullable()
  .optional();

const catchAllSchema = z.object({
  actions: z
    .array(
      z.object({
        type: z.string(),
        value: z.array(z.string()).optional()
      })
    )
    .default([]),
  enabled: z.boolean().default(false)
});

const sendingSubdomainSchema = z.object({
  enabled: z.boolean().default(false),
  name: z.string()
});

export async function inspectRouting(
  apiToken: string,
  zoneId: string
): Promise<CloudflareRoutingStatus> {
  const settings = await safeCloudflareRequest(
    apiToken,
    `/zones/${zoneId}/email/routing`,
    routingSettingsSchema
  );
  const dns = await safeCloudflareRequest(
    apiToken,
    `/zones/${zoneId}/email/routing/dns`,
    routingDnsSchema
  );

  const missingRecords =
    dns.ok && dns.result && !Array.isArray(dns.result) && Array.isArray(dns.result.errors)
      ? dns.result.errors.length
      : 0;

  return {
    dnsReady: dns.ok && missingRecords === 0,
    enabled: settings.ok ? settings.result.enabled : false,
    error: (settings.ok ? null : settings.error) ?? (dns.ok ? null : dns.error),
    missingRecords,
    status: settings.ok ? (settings.result.status ?? null) : null
  };
}

export async function inspectCatchAll(
  apiToken: string,
  zoneId: string,
  workerName: string
): Promise<CloudflareCatchAllStatus> {
  const response = await safeCloudflareRequest(
    apiToken,
    `/zones/${zoneId}/email/routing/rules/catch_all`,
    catchAllSchema
  );
  if (!response.ok) {
    return {
      configuredForWorker: false,
      enabled: false,
      error: response.error,
      workerNames: []
    };
  }

  const workerNames = response.result.actions
    .filter((action) => action.type === "worker")
    .flatMap((action) => action.value ?? []);

  return {
    configuredForWorker: workerNames.includes(workerName),
    enabled: response.result.enabled,
    error: null,
    workerNames
  };
}

export async function inspectSending(
  apiToken: string,
  zoneId: string
): Promise<CloudflareSendingStatus> {
  const response = await safeCloudflareRequest(
    apiToken,
    `/zones/${zoneId}/email/sending/subdomains`,
    z.array(sendingSubdomainSchema)
  );
  if (!response.ok) {
    return {
      enabled: false,
      error: response.error,
      subdomains: []
    };
  }

  const subdomains = response.result
    .filter((subdomain) => subdomain.enabled)
    .map((subdomain) => subdomain.name);

  return {
    enabled: subdomains.length > 0,
    error: null,
    subdomains
  };
}

import type { CloudflareZone } from "@/features/setup/types";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api-client";
import type { MailDomain } from "./types";
export const listDomains = () => apiGet<MailDomain[]>("/api/domains");
export const listAvailableCloudflareZones = async () =>
  (await apiGet<{ zones: CloudflareZone[] }>("/api/domains/cloudflare/zones")).zones;
export const revokeCloudflareAuthorization = () =>
  apiPost<{ revoked: boolean }>("/api/domains/cloudflare/revoke", {});
export const provisionDomain = (input: {
  zoneId: string;
  workerName?: string;
  name: string;
  enableSending: boolean;
}) => apiPost<{ domain: MailDomain }>("/api/domains/provision", input);
export const updateDomain = (
  id: string,
  input: {
    isEnabled?: boolean;
    catchAllPolicy?: "reject" | "unassigned" | "mailbox";
    catchAllMailboxId?: string | null;
  }
) => apiPatch<MailDomain>(`/api/domains/${id}`, input);
export const changePortal = (input: { zoneId: string; workerName?: string; hostname: string }) =>
  apiPut<{ hostname: string }>("/api/domains/portal", input);

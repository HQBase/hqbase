import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api-client";
import type { MailDomain } from "./types";
export const listDomains = () => apiGet<MailDomain[]>("/api/pro/domains");
export const provisionDomain = (input: {
  apiToken: string;
  zoneId: string;
  workerName: string;
  name: string;
  enableSending: boolean;
}) => apiPost<{ domain: MailDomain }>("/api/pro/domains/provision", input);
export const updateDomain = (
  id: string,
  input: {
    isEnabled?: boolean;
    catchAllPolicy?: "reject" | "unassigned" | "mailbox";
    catchAllMailboxId?: string | null;
  }
) => apiPatch<MailDomain>(`/api/pro/domains/${id}`, input);
export const changePortal = (input: {
  apiToken: string;
  zoneId: string;
  workerName: string;
  hostname: string;
}) => apiPut<{ hostname: string }>("/api/pro/domains/portal", input);

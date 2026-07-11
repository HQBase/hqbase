import { apiGet, apiPost } from "@/lib/api-client";
import type { EntitlementStatus } from "./types";

export const getEntitlementStatus = () => apiGet<EntitlementStatus>("/api/pro/billing");

export const activateEntitlement = (input: { licenseKey: string; hostname: string }) =>
  apiPost<EntitlementStatus>("/api/pro/billing/activate", input);

export const refreshEntitlement = () => apiPost<EntitlementStatus>("/api/pro/billing/refresh");

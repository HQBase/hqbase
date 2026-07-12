import { apiGet, apiPost } from "@/lib/api-client";
import type { UpgradeLifecycle } from "./types";

export const getUpgradeLifecycle = () => apiGet<UpgradeLifecycle | null>("/api/pro/upgrade");

export const verifyUpgradeCutover = (apiToken: string) =>
  apiPost<UpgradeLifecycle>("/api/pro/upgrade/verify-cutover", { apiToken });

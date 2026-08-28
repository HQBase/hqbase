export const PENDING_OPERATION_KEY = "hqb_cloudflare_operation_v1";

export type PendingCloudflareOperation =
  | { action: "connect"; domainName?: string | undefined }
  | { action: "disconnect"; domainId: string }
  | { action: "portal"; hostname: string; zoneId: string }
  | { action: "recheck"; domainId: string };

export function readPendingOperation(): PendingCloudflareOperation | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(PENDING_OPERATION_KEY) ?? "null"
    ) as Partial<PendingCloudflareOperation> | null;
    if (value?.action === "connect") {
      return {
        action: "connect",
        ...(typeof value.domainName === "string" ? { domainName: value.domainName } : {})
      };
    }
    if (
      value?.action === "portal" &&
      typeof value.hostname === "string" &&
      typeof value.zoneId === "string"
    ) {
      return { action: "portal", hostname: value.hostname, zoneId: value.zoneId };
    }
    if (value?.action === "recheck" && typeof value.domainId === "string") {
      return { action: "recheck", domainId: value.domainId };
    }
    if (value?.action === "disconnect" && typeof value.domainId === "string") {
      return { action: "disconnect", domainId: value.domainId };
    }
  } catch {
    // Ignore malformed, non-secret browser draft state.
  }
  return null;
}

export function oauthErrorMessage(result: string): string {
  if (result === "denied") return "Cloudflare authorization was cancelled.";
  if (result === "invalid") return "Cloudflare authorization expired. Please try again.";
  return "Cloudflare could not authorize this change. Ask a Cloudflare administrator to allow HQBase or configure customer-managed OAuth from the deployment guide.";
}

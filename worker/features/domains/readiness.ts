import type { CloudflareDomainStatus } from "../setup/types";

export function readinessSnapshot(status: CloudflareDomainStatus): {
  dnsStatus: "degraded" | "ready";
  receivingStatus: "degraded" | "ready";
  sendingStatus: "degraded" | "ready";
} {
  const zoneReady = status.zone.status === "active";
  return {
    dnsStatus: zoneReady && status.routing.dnsReady ? "ready" : "degraded",
    receivingStatus:
      zoneReady &&
      status.routing.enabled &&
      status.catchAll.enabled &&
      status.catchAll.configuredForWorker
        ? "ready"
        : "degraded",
    sendingStatus: zoneReady && status.sending.enabled ? "ready" : "degraded"
  };
}

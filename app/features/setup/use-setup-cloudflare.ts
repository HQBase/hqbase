import * as React from "react";
import { toast } from "sonner";

import { configureCloudflareDomain, listCloudflareZones, verifyCloudflareAccess } from "./api";
import { buildAppHostname, customDomainSucceeded, inferWorkerName } from "./setup-helpers";
import { hasErrors, validateDomain } from "./setup-validation";
import type { CloudflareAccessStatus, CloudflareConfigureResult, CloudflareZone } from "./types";

export type ConfiguredDomain = { zone: CloudflareZone; result: CloudflareConfigureResult };

export function useSetupCloudflare(callbacks: {
  onConnectionInvalidated: () => void;
  onDomainsChanged: (previousDomains: string[], domains: string[]) => void;
  onDomainConnected: () => void;
  onTokenVerified: () => void;
}) {
  const callbacksRef = React.useRef(callbacks);
  callbacksRef.current = callbacks;
  const [accessStatus, setAccessStatus] = React.useState<CloudflareAccessStatus | null>(null);
  const [tokenError, setTokenError] = React.useState<string | null>(null);
  const [zones, setZones] = React.useState<CloudflareZone[]>([]);
  const [selectedZoneIds, setSelectedZoneIds] = React.useState<string[]>([]);
  const [portalZoneId, setPortalZoneId] = React.useState("");
  const workerName = React.useMemo(() => inferWorkerName(), []);
  const [appSubdomain, setAppSubdomain] = React.useState("hqbase");
  const [domainAttempted, setDomainAttempted] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<ConfiguredDomain[]>([]);
  const [configuredKey, setConfiguredKey] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const selectedZones = zones.filter((zone) => selectedZoneIds.includes(zone.id));
  const portalZone = zones.find((zone) => zone.id === portalZoneId) ?? null;
  const primaryDomain = selectedZones[0]?.name ?? "";
  const appHostname = portalZone ? buildAppHostname(appSubdomain, portalZone.name) : "";
  const currentConnectionKey = [
    ...selectedZoneIds.slice().sort(),
    portalZoneId,
    appHostname,
    workerName
  ].join(":");
  const domainConnected = Boolean(
    configuredKey === currentConnectionKey &&
      results.length === selectedZones.length &&
      results.every(
        ({ result, zone }) =>
          result.status.ready && (zone.id !== portalZoneId || customDomainSucceeded(result))
      )
  );
  const domainErrors = domainAttempted
    ? validateDomain({ appSubdomain, portalZone, selectedZones })
    : {};

  const handleTokenNextRef = React.useRef(handleTokenNext);
  handleTokenNextRef.current = handleTokenNext;
  React.useEffect(() => {
    void handleTokenNextRef.current();
  }, []);

  async function handleTokenNext() {
    setTokenError(null);
    setIsLoading(true);
    try {
      const verified = await verifyCloudflareAccess();
      if (!verified.active) {
        setAccessStatus(verified);
        setTokenError(`Cloudflare reports this authorization as ${verified.status}.`);
        return;
      }
      const nextZones = await listCloudflareZones();
      if (nextZones.length === 0) {
        setTokenError("Cloudflare authorized HQBase, but no domains are available.");
        return;
      }
      setAccessStatus(verified);
      setZones(nextZones);
      callbacksRef.current.onTokenVerified();
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Could not verify Cloudflare access.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDomainConnect() {
    setDomainAttempted(true);
    const errors = validateDomain({ appSubdomain, portalZone, selectedZones });
    if (hasErrors(errors) || !portalZone) return;
    if (domainConnected) return callbacksRef.current.onDomainConnected();
    setConnectionError(null);
    setIsLoading(true);
    try {
      const configured: ConfiguredDomain[] = [];
      for (const zone of selectedZones) {
        const isPortal = zone.id === portalZone.id;
        const result = await configureCloudflareDomain({
          ...(isPortal ? { appHostname } : {}),
          attachCustomDomain: isPortal,
          enableSending: true,
          workerName: workerName.trim(),
          zoneId: zone.id
        });
        configured.push({ result, zone });
      }
      setResults(configured);
      const ready = configured.every(
        ({ result, zone }) =>
          result.status.ready && (zone.id !== portalZone.id || customDomainSucceeded(result))
      );
      if (!ready) {
        setConnectionError("Cloudflare needs attention on one or more checks below.");
        return;
      }
      setConfiguredKey(currentConnectionKey);
      toast.success(
        `${configured.length} email ${configured.length === 1 ? "domain" : "domains"} connected.`
      );
      callbacksRef.current.onDomainConnected();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Cloudflare setup failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function invalidateConnection() {
    setResults([]);
    setConfiguredKey(null);
    setConnectionError(null);
    callbacksRef.current.onConnectionInvalidated();
  }

  function toggleZone(zoneId: string, selected: boolean) {
    const previousDomains = selectedZones.map((zone) => zone.name);
    const next = selected
      ? [...selectedZoneIds, zoneId]
      : selectedZoneIds.filter((id) => id !== zoneId);
    setSelectedZoneIds(next);
    const nextDomains = zones.filter((zone) => next.includes(zone.id)).map((zone) => zone.name);
    callbacksRef.current.onDomainsChanged(previousDomains, nextDomains);
    if (!next.includes(portalZoneId)) setPortalZoneId(next[0] ?? "");
    invalidateConnection();
  }

  const update = (action: () => void) => {
    action();
    invalidateConnection();
  };
  return {
    access: {
      error: tokenError,
      isLoading,
      onNext: () => window.location.assign("/api/setup/cloudflare/oauth/start")
    },
    domain: {
      appHostname,
      appSubdomain,
      connectionError,
      errors: domainErrors,
      isLoading,
      portalZone,
      portalZoneId,
      results,
      selectedZoneIds,
      selectedZones,
      zones,
      onConnect: () => void handleDomainConnect(),
      onToggleZone: toggleZone,
      setAppSubdomain: (value: string) => update(() => setAppSubdomain(value)),
      setPortalZoneId: (value: string) => update(() => setPortalZoneId(value))
    },
    domainConnected,
    emailDomains: selectedZones.map(({ accountId, id, name }) => ({ accountId, name, zoneId: id })),
    primaryDomain,
    portalHostname: appHostname,
    requireConnection(message = "Connect the domains before continuing.") {
      setDomainAttempted(true);
      setConnectionError(message);
    },
    tokenReady: accessStatus?.active === true
  };
}

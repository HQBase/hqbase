import * as React from "react";
import { toast } from "sonner";

import { configureCloudflareDomain, listCloudflareZones, verifyCloudflareToken } from "./api";
import { buildAppHostname, customDomainSucceeded, inferWorkerName } from "./setup-helpers";
import { hasErrors, validateDomain, validateToken } from "./setup-validation";
import type { CloudflareConfigureResult, CloudflareTokenStatus, CloudflareZone } from "./types";

export type ConfiguredDomain = { zone: CloudflareZone; result: CloudflareConfigureResult };

export function useSetupCloudflare(callbacks: {
  onConnectionInvalidated: () => void;
  onDomainChanged: (previousDomain: string, domain: string) => void;
  onDomainConnected: () => void;
  onTokenChanged: () => void;
  onTokenVerified: () => void;
}) {
  const [apiToken, setApiToken] = React.useState("");
  const [tokenStatus, setTokenStatus] = React.useState<CloudflareTokenStatus | null>(null);
  const [tokenError, setTokenError] = React.useState<string | null>(null);
  const [zones, setZones] = React.useState<CloudflareZone[]>([]);
  const [selectedZoneIds, setSelectedZoneIds] = React.useState<string[]>([]);
  const [portalZoneId, setPortalZoneId] = React.useState("");
  const workerName = React.useMemo(() => inferWorkerName(), []);
  const [appSubdomain, setAppSubdomain] = React.useState("hqbase");
  const [serviceSubdomain, setServiceSubdomain] = React.useState("hqbase-api");
  const [domainAttempted, setDomainAttempted] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<ConfiguredDomain[]>([]);
  const [configuredKey, setConfiguredKey] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const selectedZones = zones.filter((zone) => selectedZoneIds.includes(zone.id));
  const portalZone = zones.find((zone) => zone.id === portalZoneId) ?? null;
  const primaryDomain = selectedZones[0]?.name ?? "";
  const appHostname = portalZone ? buildAppHostname(appSubdomain, portalZone.name) : "";
  const serviceHostname = portalZone ? buildAppHostname(serviceSubdomain, portalZone.name) : "";
  const currentConnectionKey = [
    ...selectedZoneIds.slice().sort(),
    portalZoneId,
    appHostname,
    serviceHostname,
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
    ? validateDomain({ appSubdomain, portalZone, selectedZones, serviceSubdomain })
    : {};

  async function handleTokenNext() {
    const validationError = validateToken(apiToken);
    setTokenError(validationError);
    if (validationError) return;
    setIsLoading(true);
    try {
      const verified = await verifyCloudflareToken(apiToken.trim());
      if (!verified.active) {
        setTokenStatus(verified);
        setTokenError(`Cloudflare reports this token as ${verified.status}.`);
        return;
      }
      const nextZones = await listCloudflareZones(apiToken.trim());
      if (nextZones.length === 0) {
        setTokenError("The token is valid, but it cannot read any Cloudflare domains.");
        return;
      }
      setTokenStatus(verified);
      setZones(nextZones);
      callbacks.onTokenVerified();
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Could not verify this token.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDomainConnect() {
    setDomainAttempted(true);
    const errors = validateDomain({ appSubdomain, portalZone, selectedZones, serviceSubdomain });
    if (hasErrors(errors) || !portalZone) return;
    if (domainConnected) return callbacks.onDomainConnected();
    setConnectionError(null);
    setIsLoading(true);
    try {
      const configured: ConfiguredDomain[] = [];
      for (const zone of selectedZones) {
        const isPortal = zone.id === portalZone.id;
        const result = await configureCloudflareDomain({
          ...(isPortal ? { appHostname, serviceHostname } : {}),
          attachCustomDomain: isPortal,
          apiToken,
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
      callbacks.onDomainConnected();
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
    callbacks.onConnectionInvalidated();
  }

  function handleTokenChange(value: string) {
    setApiToken(value);
    setTokenStatus(null);
    setTokenError(null);
    setZones([]);
    setSelectedZoneIds([]);
    setPortalZoneId("");
    invalidateConnection();
    callbacks.onTokenChanged();
  }

  function toggleZone(zoneId: string, selected: boolean) {
    const previousDomain = primaryDomain;
    const next = selected
      ? [...selectedZoneIds, zoneId]
      : selectedZoneIds.filter((id) => id !== zoneId);
    setSelectedZoneIds(next);
    const nextPrimary = zones.find((zone) => zone.id === next[0])?.name ?? "";
    if (nextPrimary !== previousDomain) callbacks.onDomainChanged(previousDomain, nextPrimary);
    if (!next.includes(portalZoneId)) setPortalZoneId(next[0] ?? "");
    invalidateConnection();
  }

  const update = (action: () => void) => {
    action();
    invalidateConnection();
  };
  return {
    access: {
      apiToken,
      error: tokenError,
      isLoading,
      onApiTokenChange: handleTokenChange,
      onNext: () => void handleTokenNext()
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
      serviceHostname,
      serviceSubdomain,
      zones,
      onConnect: () => void handleDomainConnect(),
      onToggleZone: toggleZone,
      setAppSubdomain: (value: string) => update(() => setAppSubdomain(value)),
      setPortalZoneId: (value: string) => update(() => setPortalZoneId(value)),
      setServiceSubdomain: (value: string) => update(() => setServiceSubdomain(value))
    },
    domainConnected,
    emailDomains: selectedZones.map(({ accountId, id, name }) => ({ accountId, name, zoneId: id })),
    primaryDomain,
    portalHostname: appHostname,
    requireConnection(message = "Connect the domains before continuing.") {
      setDomainAttempted(true);
      setConnectionError(message);
    },
    serviceHostname,
    tokenReady: tokenStatus?.active === true
  };
}

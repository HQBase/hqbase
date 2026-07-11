import * as React from "react";
import { toast } from "sonner";

import { configureCloudflareDomain, listCloudflareZones, verifyCloudflareToken } from "./api";
import {
  buildAppHostname,
  connectionFingerprint,
  customDomainSucceeded,
  inferWorkerName
} from "./setup-helpers";
import { hasErrors, validateDomain, validateToken } from "./setup-validation";
import type { CloudflareConfigureResult, CloudflareTokenStatus, CloudflareZone } from "./types";

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
  const [selectedZoneId, setSelectedZoneId] = React.useState("");
  const workerName = React.useMemo(() => inferWorkerName(), []);
  const [appSubdomain, setAppSubdomain] = React.useState("hqbase");
  const [domainAttempted, setDomainAttempted] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CloudflareConfigureResult | null>(null);
  const [configuredKey, setConfiguredKey] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const primaryDomain = selectedZone?.name ?? "";
  const appHostname = selectedZone ? buildAppHostname(appSubdomain, selectedZone.name) : "";
  const currentConnectionKey = connectionFingerprint({
    appHostname,
    workerName,
    zoneId: selectedZoneId
  });
  const domainConnected = Boolean(
    configuredKey === currentConnectionKey && result?.status.ready && customDomainSucceeded(result)
  );
  const domainErrors = domainAttempted ? validateDomain({ appSubdomain, selectedZone }) : {};

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
    const errors = validateDomain({ appSubdomain, selectedZone });
    if (hasErrors(errors) || !selectedZone) return;
    if (domainConnected) {
      callbacks.onDomainConnected();
      return;
    }
    setConnectionError(null);
    setIsLoading(true);
    try {
      const nextResult = await configureCloudflareDomain({
        appHostname,
        attachCustomDomain: true,
        apiToken,
        enableSending: true,
        workerName: workerName.trim(),
        zoneId: selectedZone.id
      });
      setResult(nextResult);
      const ready = nextResult.status.ready && customDomainSucceeded(nextResult);
      if (!ready) {
        setConnectionError(
          "Cloudflare needs attention on one or more checks below. Fix the indicated permission or setting, then try again."
        );
        return;
      }
      setConfiguredKey(currentConnectionKey);
      toast.success(`${selectedZone.name} is connected.`);
      callbacks.onDomainConnected();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Cloudflare setup failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleTokenChange(value: string) {
    setApiToken(value);
    setTokenStatus(null);
    setTokenError(null);
    setZones([]);
    setSelectedZoneId("");
    invalidateConnection();
    callbacks.onTokenChanged();
  }

  function handleDomainSelect(zoneId: string) {
    const previousDomain = primaryDomain;
    const zone = zones.find((item) => item.id === zoneId) ?? null;
    setSelectedZoneId(zoneId);
    if (zone) callbacks.onDomainChanged(previousDomain, zone.name);
    invalidateConnection();
  }

  function updateConnectionInput(update: () => void) {
    update();
    invalidateConnection();
  }

  function invalidateConnection() {
    setResult(null);
    setConfiguredKey(null);
    setConnectionError(null);
    callbacks.onConnectionInvalidated();
  }

  function requireConnection(message = "Connect the domain before continuing.") {
    setDomainAttempted(true);
    setConnectionError(message);
  }

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
      result,
      selectedZone,
      selectedZoneId,
      setAppSubdomain: (value: string) => updateConnectionInput(() => setAppSubdomain(value)),
      zones,
      onConnect: () => void handleDomainConnect(),
      onSelect: handleDomainSelect
    },
    domainConnected,
    primaryDomain,
    requireConnection,
    tokenReady: tokenStatus?.active === true
  };
}

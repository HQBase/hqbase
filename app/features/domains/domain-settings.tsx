import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  changePortal,
  changeServiceOrigin,
  listDomains,
  revokeCloudflareAuthorization,
  updateDomain
} from "./api";
import { ConnectDomainDialog } from "./connect-domain-dialog";
import type { MailDomain } from "./types";

const PENDING_OPERATION_KEY = "hqb_pro_cloudflare_operation_v1";

type PendingCloudflareOperation =
  | { action: "connect" }
  | { action: "portal" | "service"; hostname: string; zoneId: string };

export function DomainSettings({
  portalHostname,
  serviceHostname,
  onChanged
}: {
  portalHostname: string | null;
  serviceHostname: string | null;
  onChanged: () => void;
}): React.ReactElement {
  const [domains, setDomains] = React.useState<MailDomain[]>([]);
  const [hostname, setHostname] = React.useState(portalHostname ?? "");
  const [bridgeHostname, setBridgeHostname] = React.useState(serviceHostname ?? "");
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [connectAuthorized, setConnectAuthorized] = React.useState(false);
  const [changePending, setChangePending] = React.useState(false);
  const resumedRef = React.useRef(false);

  const refresh = React.useCallback(
    () =>
      void listDomains()
        .then(setDomains)
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : "Domains could not be loaded.")
        ),
    []
  );
  React.useEffect(refresh, [refresh]);

  React.useEffect(() => {
    if (resumedRef.current) return;
    const url = new URL(window.location.href);
    const result = url.searchParams.get("cloudflare");
    if (!result || url.searchParams.get("settings") !== "domains") return;
    resumedRef.current = true;
    url.searchParams.delete("cloudflare");
    url.searchParams.delete("settings");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    const pending = readPendingOperation();
    if (result !== "connected") {
      sessionStorage.removeItem(PENDING_OPERATION_KEY);
      toast.error(oauthErrorMessage(result));
      return;
    }
    if (!pending) {
      toast.error("Cloudflare is authorized. Start the domain change again to continue.");
      return;
    }
    if (pending.action === "connect") {
      sessionStorage.removeItem(PENDING_OPERATION_KEY);
      setConnectAuthorized(true);
      setConnectOpen(true);
      return;
    }

    setChangePending(true);
    const change =
      pending.action === "portal"
        ? changePortal({ zoneId: pending.zoneId, hostname: pending.hostname })
        : changeServiceOrigin({ zoneId: pending.zoneId, hostname: pending.hostname });
    void change
      .then(() => {
        onChanged();
        toast.success(
          pending.action === "portal" ? "Portal address changed." : "Bridge origin changed."
        );
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Cloudflare change failed.");
      })
      .finally(() => {
        sessionStorage.removeItem(PENDING_OPERATION_KEY);
        setChangePending(false);
      });
  }, [onChanged]);

  function portal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domain = domains.find((item) => hostname.endsWith(`.${item.name}`));
    if (!domain?.zoneId) {
      toast.error("The portal must use a connected domain with a Cloudflare zone.");
      return;
    }
    authorizeCloudflare({ action: "portal", zoneId: domain.zoneId, hostname });
  }

  function service(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bridgeHostname === portalHostname) {
      toast.error("The bridge origin must differ from the workspace portal.");
      return;
    }
    const domain = domains.find((item) => bridgeHostname.endsWith(`.${item.name}`));
    if (!domain?.zoneId) {
      toast.error("The bridge origin must use a connected domain with a Cloudflare zone.");
      return;
    }
    authorizeCloudflare({ action: "service", zoneId: domain.zoneId, hostname: bridgeHostname });
  }

  function authorizeCloudflare(operation: PendingCloudflareOperation) {
    sessionStorage.setItem(PENDING_OPERATION_KEY, JSON.stringify(operation));
    window.location.assign("/api/pro/domains/cloudflare/oauth/start");
  }

  return (
    <SettingsSection
      action={
        <ConnectDomainDialog
          authorized={connectAuthorized}
          domains={domains}
          open={connectOpen}
          onAuthorize={() =>
            sessionStorage.setItem(PENDING_OPERATION_KEY, JSON.stringify({ action: "connect" }))
          }
          onConnected={() => {
            setConnectAuthorized(false);
            setConnectOpen(false);
            refresh();
            onChanged();
          }}
          onOpenChange={(nextOpen) => {
            setConnectOpen(nextOpen);
            if (!nextOpen && connectAuthorized) {
              setConnectAuthorized(false);
              void revokeCloudflareAuthorization().catch(() => undefined);
            }
          }}
        />
      }
      description="Domains group infrastructure; access remains attached to mailboxes"
      title="Email domains"
    >
      <div className="grid gap-3">
        {domains.map((domain) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            key={domain.id}
          >
            <div>
              <p className="font-medium">{domain.name}</p>
              <p className="text-xs text-muted-foreground">
                Receive {domain.receivingStatus} · Send {domain.sendingStatus} · DNS{" "}
                {domain.dnsStatus}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={domain.isEnabled ? "secondary" : "outline"}>
                {domain.isEnabled ? "Enabled" : "Disabled"}
              </Badge>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() =>
                  void updateDomain(domain.id, { isEnabled: !domain.isEnabled }).then(refresh)
                }
              >
                {domain.isEnabled ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-medium">Cloudflare changes</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Change the public portal or mail-bridge origin for a connected domain.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <form className="flex flex-col gap-3" onSubmit={portal}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="portal-hostname">Workspace portal</FieldLabel>
              <Input
                id="portal-hostname"
                placeholder="mail.example.com"
                required
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <Button className="self-start" disabled={changePending} type="submit">
            Authorize and change portal
          </Button>
        </form>
        <form className="flex flex-col gap-3" onSubmit={service}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="bridge-hostname">Bridge origin</FieldLabel>
              <Input
                id="bridge-hostname"
                placeholder="bridge.example.com"
                required
                value={bridgeHostname}
                onChange={(event) => setBridgeHostname(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <Button className="self-start" disabled={changePending} type="submit">
            Authorize and change bridge origin
          </Button>
        </form>
      </div>
    </SettingsSection>
  );
}

function readPendingOperation(): PendingCloudflareOperation | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(PENDING_OPERATION_KEY) ?? "null"
    ) as Partial<PendingCloudflareOperation> | null;
    if (value?.action === "connect") return { action: "connect" };
    if (
      (value?.action === "portal" || value?.action === "service") &&
      typeof value.hostname === "string" &&
      typeof value.zoneId === "string"
    ) {
      return { action: value.action, hostname: value.hostname, zoneId: value.zoneId };
    }
  } catch {
    // Ignore malformed, non-secret browser draft state.
  }
  return null;
}

function oauthErrorMessage(result: string): string {
  if (result === "denied") return "Cloudflare authorization was cancelled.";
  if (result === "invalid") return "Cloudflare authorization expired. Please try again.";
  return "Cloudflare could not authorize this change. If your organization blocks HQBase, ask a Cloudflare administrator to allow the OAuth application.";
}

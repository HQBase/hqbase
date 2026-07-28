import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CloudflareAuthorizationDialog } from "@/features/settings/cloudflare-authorization-dialog";
import { SettingsSection } from "@/features/settings/settings-section";
import { changePortal, listDomains, revokeCloudflareAuthorization, updateDomain } from "./api";
import { ConnectDomainDialog } from "./connect-domain-dialog";
import { DomainTable } from "./domain-table";
import type { MailDomain } from "./types";

const PENDING_OPERATION_KEY = "hqb_cloudflare_operation_v1";

type PendingCloudflareOperation =
  | { action: "connect" }
  | { action: "portal"; hostname: string; zoneId: string };

export function DomainSettings({
  portalHostname,
  onChanged
}: {
  portalHostname: string | null;
  onChanged: () => void;
}): React.ReactElement {
  const [domains, setDomains] = React.useState<MailDomain[]>([]);
  const [hostname, setHostname] = React.useState(portalHostname ?? "");
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [connectAuthorized, setConnectAuthorized] = React.useState(false);
  const [changePending, setChangePending] = React.useState(false);
  const [authorizationOperation, setAuthorizationOperation] =
    React.useState<PendingCloudflareOperation | null>(null);
  const [pendingDomainId, setPendingDomainId] = React.useState<string | null>(null);
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
    if (url.searchParams.get("reauth") === "required") {
      resumedRef.current = true;
      url.searchParams.delete("reauth");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      const pending = readPendingOperation();
      if (pending?.action === "connect") {
        setConnectOpen(true);
      } else if (pending?.action === "portal") {
        setAuthorizationOperation(pending);
      } else {
        toast.error("Sign in again, then restart the Cloudflare change.");
      }
      return;
    }
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
    void changePortal({ zoneId: pending.zoneId, hostname: pending.hostname })
      .then(() => {
        onChanged();
        toast.success("Workspace portal updated.");
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
    setAuthorizationOperation({ action: "portal", zoneId: domain.zoneId, hostname });
  }

  async function toggleDomain(domain: MailDomain) {
    setPendingDomainId(domain.id);
    try {
      await updateDomain(domain.id, { isEnabled: !domain.isEnabled });
      refresh();
      toast.success(`${domain.name} ${domain.isEnabled ? "disabled" : "enabled"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Domain could not be updated.");
    } finally {
      setPendingDomainId(null);
    }
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
      <DomainTable
        domains={domains}
        pendingDomainId={pendingDomainId}
        onToggle={(domain) => void toggleDomain(domain)}
      />

      <Separator />

      <div>
        <h3 className="text-sm font-medium">Cloudflare changes</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Change the public workspace portal for a connected domain.
        </p>
      </div>
      <div>
        <form className="flex max-w-2xl flex-col gap-3" onSubmit={portal}>
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
            Save
          </Button>
        </form>
      </div>
      <CloudflareAuthorizationDialog
        authorizeHref="/api/domains/cloudflare/oauth/start"
        description="To save this change, HQBase needs temporary access to your Cloudflare account. You’ll return to Domains automatically, and HQBase will update the workspace portal."
        open={authorizationOperation?.action === "portal"}
        onAuthorize={() => {
          if (authorizationOperation) {
            sessionStorage.setItem(PENDING_OPERATION_KEY, JSON.stringify(authorizationOperation));
          }
        }}
        onOpenChange={(open) => {
          if (!open) setAuthorizationOperation(null);
        }}
      />
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
      value?.action === "portal" &&
      typeof value.hostname === "string" &&
      typeof value.zoneId === "string"
    ) {
      return { action: "portal", hostname: value.hostname, zoneId: value.zoneId };
    }
  } catch {
    // Ignore malformed, non-secret browser draft state.
  }
  return null;
}

function oauthErrorMessage(result: string): string {
  if (result === "denied") return "Cloudflare authorization was cancelled.";
  if (result === "invalid") return "Cloudflare authorization expired. Please try again.";
  return "Cloudflare could not authorize this change. Ask a Cloudflare administrator to allow HQBase or configure customer-managed OAuth from the deployment guide.";
}

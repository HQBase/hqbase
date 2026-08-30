import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import type { Mailbox } from "@/features/mailboxes/types";
import { CloudflareAuthorizationDialog } from "@/features/settings/cloudflare-authorization-dialog";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  changePortal,
  disconnectDomain,
  forgetDomain,
  listDomains,
  recheckDomain,
  revokeCloudflareAuthorization,
  updateDomain
} from "./api";
import type { CatchAllPolicy } from "./catch-all-policy-control";
import { ConnectDomainDialog } from "./connect-domain-dialog";
import { DisconnectDomainDialog, ForgetDomainDialog } from "./domain-lifecycle-dialogs";
import {
  oauthErrorMessage,
  PENDING_OPERATION_KEY,
  type PendingCloudflareOperation,
  readPendingOperation
} from "./domain-oauth-state";
import {
  DomainSuffixInput,
  hasCompleteDomainSuffix,
  parseDomainSuffix
} from "./domain-suffix-input";
import { DomainTable } from "./domain-table";
import type { MailDomain } from "./types";

export function DomainSettings({
  mailboxes,
  portalHostname,
  onChanged
}: {
  mailboxes: Mailbox[];
  portalHostname: string | null;
  onChanged: () => void;
}): React.ReactElement {
  const [domains, setDomains] = React.useState<MailDomain[]>([]);
  const [hostname, setHostname] = React.useState(portalHostname ?? "");
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [connectAuthorized, setConnectAuthorized] = React.useState(false);
  const [preferredDomainName, setPreferredDomainName] = React.useState<string | null>(null);
  const [disconnectConfirmation, setDisconnectConfirmation] = React.useState<MailDomain | null>(
    null
  );
  const [forgetConfirmation, setForgetConfirmation] = React.useState<MailDomain | null>(null);
  const [forgetInput, setForgetInput] = React.useState("");
  const [changePending, setChangePending] = React.useState(false);
  const [authorizationOperation, setAuthorizationOperation] =
    React.useState<PendingCloudflareOperation | null>(null);
  const [pendingDomainId, setPendingDomainId] = React.useState<string | null>(null);
  const resumedRef = React.useRef(false);
  const availablePortalDomains = domains.filter((domain) => domain.zoneId !== null);

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
        setPreferredDomainName(pending.domainName ?? null);
        setConnectOpen(true);
      } else if (
        pending?.action === "portal" ||
        pending?.action === "recheck" ||
        pending?.action === "disconnect"
      ) {
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
      setPreferredDomainName(pending.domainName ?? null);
      setConnectAuthorized(true);
      setConnectOpen(true);
      return;
    }

    if (pending.action === "disconnect") {
      setPendingDomainId(pending.domainId);
      void disconnectDomain(pending.domainId)
        .then((domain) => {
          setDomains((current) => current.map((item) => (item.id === domain.id ? domain : item)));
          onChanged();
          toast.success(`${domain.name} disconnected from HQBase mail.`);
        })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : "Domain could not be disconnected.");
        })
        .finally(() => {
          sessionStorage.removeItem(PENDING_OPERATION_KEY);
          setPendingDomainId(null);
        });
      return;
    }

    if (pending.action === "recheck") {
      setPendingDomainId(pending.domainId);
      void recheckDomain(pending.domainId)
        .then((domain) => {
          setDomains((current) => current.map((item) => (item.id === domain.id ? domain : item)));
          toast.success(`Readiness updated for ${domain.name}.`);
        })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : "Readiness could not be checked.");
        })
        .finally(() => {
          sessionStorage.removeItem(PENDING_OPERATION_KEY);
          setPendingDomainId(null);
        });
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
    const selected = parseDomainSuffix(hostname, availablePortalDomains, ".").domain;
    const domain = domains.find((item) => item.id === selected?.id);
    if (!domain?.zoneId) {
      toast.error("The portal must use a connected domain with a Cloudflare zone.");
      return;
    }
    setAuthorizationOperation({ action: "portal", zoneId: domain.zoneId, hostname });
  }

  async function toggleDomain(domain: MailDomain, isEnabled: boolean) {
    setPendingDomainId(domain.id);
    try {
      const updatedDomain = await updateDomain(domain.id, { isEnabled });
      setDomains((current) =>
        current.map((item) => (item.id === updatedDomain.id ? updatedDomain : item))
      );
      toast.success(`${domain.name} ${isEnabled ? "enabled" : "disabled"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Domain could not be updated.");
    } finally {
      setPendingDomainId(null);
    }
  }

  async function changeCatchAllPolicy(
    domain: MailDomain,
    catchAllPolicy: CatchAllPolicy,
    catchAllMailboxId: string | null
  ): Promise<void> {
    setPendingDomainId(domain.id);
    try {
      const updatedDomain = await updateDomain(domain.id, {
        catchAllPolicy,
        catchAllMailboxId
      });
      setDomains((current) =>
        current.map((item) => (item.id === updatedDomain.id ? updatedDomain : item))
      );
      onChanged();
      toast.success(`Unknown-address policy saved for ${domain.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Policy could not be updated.");
    } finally {
      setPendingDomainId(null);
    }
  }

  async function forget(): Promise<void> {
    if (!forgetConfirmation) return;
    setPendingDomainId(forgetConfirmation.id);
    try {
      await forgetDomain(forgetConfirmation.id, forgetInput);
      setDomains((current) => current.filter((domain) => domain.id !== forgetConfirmation.id));
      setForgetConfirmation(null);
      setForgetInput("");
      onChanged();
      toast.success(`${forgetConfirmation.name} forgotten.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Domain could not be forgotten.");
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
          preferredDomainName={preferredDomainName}
          onAuthorize={() =>
            sessionStorage.setItem(
              PENDING_OPERATION_KEY,
              JSON.stringify({
                action: "connect",
                ...(preferredDomainName ? { domainName: preferredDomainName } : {})
              })
            )
          }
          onConnected={() => {
            setConnectAuthorized(false);
            setConnectOpen(false);
            setPreferredDomainName(null);
            refresh();
            onChanged();
          }}
          onOpenChange={(nextOpen) => {
            setConnectOpen(nextOpen);
            if (!nextOpen && connectAuthorized) {
              setConnectAuthorized(false);
              void revokeCloudflareAuthorization().catch(() => undefined);
            }
            if (!nextOpen) setPreferredDomainName(null);
          }}
        />
      }
      description="Domains group infrastructure; access remains attached to mailboxes"
      title="Email domains"
    >
      <DomainTable
        domains={domains}
        mailboxes={mailboxes}
        pendingDomainId={pendingDomainId}
        portalHostname={portalHostname}
        onCatchAllChange={(domain, policy, mailboxId) =>
          void changeCatchAllPolicy(domain, policy, mailboxId)
        }
        onDisconnect={setDisconnectConfirmation}
        onForget={(domain) => {
          setForgetInput("");
          setForgetConfirmation(domain);
        }}
        onRecheck={(domain) =>
          setAuthorizationOperation({ action: "recheck", domainId: domain.id })
        }
        onReconnect={(domain) => {
          setPreferredDomainName(domain.name);
          setConnectOpen(true);
        }}
        onToggle={(domain, isEnabled) => void toggleDomain(domain, isEnabled)}
      />
      <p className="text-xs text-muted-foreground">
        Exact mailbox addresses take priority. Unknown-address changes apply only to new mail.
      </p>

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
              <DomainSuffixInput
                domains={availablePortalDomains}
                id="portal-hostname"
                placeholder="mail"
                required
                separator="."
                value={hostname}
                onValueChange={setHostname}
              />
            </Field>
          </FieldGroup>
          <Button
            className="self-start"
            disabled={
              changePending || !hasCompleteDomainSuffix(hostname, availablePortalDomains, ".")
            }
            type="submit"
          >
            Save
          </Button>
        </form>
      </div>
      <DisconnectDomainDialog
        domain={disconnectConfirmation}
        onConfirm={() => {
          if (!disconnectConfirmation) return;
          setAuthorizationOperation({
            action: "disconnect",
            domainId: disconnectConfirmation.id
          });
          setDisconnectConfirmation(null);
        }}
        onOpenChange={(open) => !open && setDisconnectConfirmation(null)}
      />
      <ForgetDomainDialog
        confirmation={forgetInput}
        domain={forgetConfirmation}
        pending={pendingDomainId === forgetConfirmation?.id}
        onConfirm={() => void forget()}
        onConfirmationChange={setForgetInput}
        onOpenChange={(open) => {
          if (!open) {
            setForgetConfirmation(null);
            setForgetInput("");
          }
        }}
      />
      <CloudflareAuthorizationDialog
        authorizeHref="/api/domains/cloudflare/oauth/start"
        description={
          authorizationOperation?.action === "recheck"
            ? "HQBase needs temporary access to read the current receiving, sending, and DNS status. It will not change Cloudflare."
            : authorizationOperation?.action === "disconnect"
              ? "HQBase needs temporary access to remove its catch-all Worker route. It will leave shared Email Routing, Email Sending, DNS, and the workspace portal unchanged."
              : "To save this change, HQBase needs temporary access to your Cloudflare account. You’ll return to Domains automatically, and HQBase will update the workspace portal."
        }
        open={authorizationOperation !== null && authorizationOperation.action !== "connect"}
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

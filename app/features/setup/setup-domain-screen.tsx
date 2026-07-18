import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import type * as React from "react";

import { ProUpgradeCard } from "@/components/pro-upgrade";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLabelRow
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { DomainErrors } from "./setup-validation";
import { WizardActions, WizardPanel } from "./setup-wizard-parts";
import type { CloudflareConfigureResult, CloudflareZone } from "./types";

export function DomainStep({
  appHostname,
  appSubdomain,
  connectionError,
  errors,
  isLoading,
  onBack,
  onConnect,
  onSelect,
  result,
  selectedZone,
  selectedZoneId,
  setAppSubdomain,
  zones
}: {
  appHostname: string;
  appSubdomain: string;
  connectionError: string | null;
  errors: DomainErrors;
  isLoading: boolean;
  onBack: (() => void) | null;
  onConnect: () => void;
  onSelect: (zoneId: string) => void;
  result: CloudflareConfigureResult | null;
  selectedZone: CloudflareZone | null;
  selectedZoneId: string;
  setAppSubdomain: (value: string) => void;
  zones: CloudflareZone[];
}): React.ReactElement {
  const failed = result ? !isDomainReady(result) : false;

  return (
    <WizardPanel
      actions={
        <WizardActions
          isLoading={isLoading}
          nextLabel={isLoading ? "Connecting..." : failed ? "Retry" : "Connect domain"}
          onBack={onBack}
          onNext={onConnect}
        />
      }
      ariaLabel="Domain configuration"
      description=""
      showHeader={false}
      title=""
    >
      {connectionError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not connect the domain</AlertTitle>
          <AlertDescription>{connectionError}</AlertDescription>
        </Alert>
      ) : null}

      <Field data-invalid={Boolean(errors.selectedZoneId)}>
        <FieldLabelRow>
          <FieldLabel htmlFor="setup-domain">Select email domain</FieldLabel>
          {errors.selectedZoneId ? <FieldError>{errors.selectedZoneId}</FieldError> : null}
        </FieldLabelRow>
        <Select value={selectedZoneId} onValueChange={onSelect}>
          <SelectTrigger id="setup-domain" aria-invalid={Boolean(errors.selectedZoneId)}>
            <SelectValue placeholder="Choose a domain" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {zones.map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name} · {zone.status}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          Shared mailboxes use this domain. Missing? Add it in Cloudflare, then reverify.
        </FieldDescription>
        {result ? <CompactDomainChecks result={result} /> : null}
      </Field>

      {zones.length > 1 ? (
        <ProUpgradeCard
          description="Connect every domain in this Cloudflare account and manage all addresses from one workspace."
          placement="onboarding-domains"
          title={`You have ${zones.length} domains. Pro can connect them together.`}
        />
      ) : null}

      <Field data-invalid={Boolean(errors.appSubdomain)}>
        <FieldLabelRow>
          <FieldLabel htmlFor="app-subdomain">Workspace URL</FieldLabel>
          {errors.appSubdomain ? <FieldError>{errors.appSubdomain}</FieldError> : null}
        </FieldLabelRow>
        <InputGroup data-invalid={Boolean(errors.appSubdomain)}>
          <InputGroupInput
            aria-invalid={Boolean(errors.appSubdomain)}
            autoCapitalize="none"
            id="app-subdomain"
            value={appSubdomain}
            onChange={(event) => setAppSubdomain(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>.{selectedZone?.name ?? "yourdomain.com"}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>
          Your webmail UI will be available at {appHostname || `${appSubdomain}.yourdomain.com`}.
        </FieldDescription>
      </Field>
    </WizardPanel>
  );
}

function CompactDomainChecks({ result }: { result: CloudflareConfigureResult }) {
  const checks = [
    ...result.steps.map((step) => ({
      label: compactStepLabel(step.id, step.label),
      message: step.status === "failed" ? step.message : null,
      status: step.status
    })),
    {
      label: "Readiness check",
      message: result.status.ready ? null : describeReadinessFailure(result.status),
      status: result.status.ready ? ("success" as const) : ("failed" as const)
    }
  ];

  return (
    <div className="flex flex-col gap-1 pt-2">
      {checks.map((check) => (
        <div className="flex items-start gap-2 text-xs" key={check.label}>
          {check.status === "failed" ? (
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          ) : check.status === "skipped" ? (
            <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
          )}
          <div className="min-w-0">
            <p
              className={
                check.status === "failed"
                  ? "text-xs leading-4 text-destructive"
                  : "text-xs leading-4 text-foreground"
              }
            >
              {check.label}
            </p>
            {check.message ? (
              <p className="mt-0.5 break-words text-xs leading-4 text-muted-foreground">
                {check.message}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function isDomainReady(result: CloudflareConfigureResult): boolean {
  return result.status.ready && result.steps.every((step) => step.status !== "failed");
}

function compactStepLabel(id: string, fallback: string): string {
  if (id === "custom-domain") return "Attach app URL";
  if (id === "service-domain") return "Attach service URL";
  if (id === "routing") return "Email Routing + DNS";
  if (id === "catch-all") return "Catch-all → HQBase";
  if (id === "sending") return "Outbound sending";
  return fallback;
}

function describeReadinessFailure(status: CloudflareConfigureResult["status"]): string {
  const issues: string[] = [];
  if (status.zone.status !== "active") issues.push("The Cloudflare domain is not active.");
  if (!status.routing.enabled) {
    issues.push(status.routing.error ?? "Email Routing is not enabled.");
  } else if (!status.routing.dnsReady) {
    issues.push(
      status.routing.missingRecords > 0
        ? `Cloudflare still reports ${status.routing.missingRecords} missing Email Routing DNS records.`
        : (status.routing.error ?? "Email Routing DNS is not ready yet.")
    );
  }
  if (!status.catchAll.enabled || !status.catchAll.configuredForWorker) {
    issues.push(status.catchAll.error ?? "Catch-all is not routing to this HQBase Worker.");
  }
  if (!status.sending.enabled) {
    issues.push(status.sending.error ?? "Email Sending is not enabled.");
  }
  return issues.join(" ") || "Cloudflare has not reported this domain as ready yet.";
}

import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLabelRow
} from "@/components/ui/field";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
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
import type { ConfiguredDomain } from "./use-setup-cloudflare";

export function DomainStep(props: {
  appHostname: string;
  appSubdomain: string;
  connectionError: string | null;
  errors: DomainErrors;
  isLoading: boolean;
  onBack: () => void;
  onConnect: () => void;
  onToggleZone: (zoneId: string, selected: boolean) => void;
  portalZone: CloudflareZone | null;
  portalZoneId: string;
  results: ConfiguredDomain[];
  selectedZoneIds: string[];
  selectedZones: CloudflareZone[];
  setAppSubdomain: (value: string) => void;
  setPortalZoneId: (value: string) => void;
  zones: CloudflareZone[];
}): React.ReactElement {
  const failed = props.results.some(
    ({ result }) => !result.status.ready || result.steps.some((step) => step.status === "failed")
  );
  return (
    <WizardPanel
      actions={
        <WizardActions
          isLoading={props.isLoading}
          nextLabel={props.isLoading ? "Connecting..." : failed ? "Retry" : "Connect domains"}
          onBack={props.onBack}
          onNext={props.onConnect}
        />
      }
      ariaLabel="Domain configuration"
      description=""
      showHeader={false}
      title=""
    >
      {props.connectionError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not connect every domain</AlertTitle>
          <AlertDescription>{props.connectionError}</AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={Boolean(props.errors.selectedZoneIds)}>
        <FieldLabelRow>
          <FieldLabel>Select email domains</FieldLabel>
          {props.errors.selectedZoneIds ? (
            <FieldError>{props.errors.selectedZoneIds}</FieldError>
          ) : null}
        </FieldLabelRow>
        <div className="flex flex-col">
          {props.zones.map((zone) => {
            const configured = props.results.find((item) => item.zone.id === zone.id)?.result;
            const hasError = configured ? !isDomainReady(configured) : false;
            return (
              <div className="border-b py-1.5 last:border-b-0" key={zone.id}>
                <label
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 hover:bg-muted/50"
                  htmlFor={`domain-${zone.id}`}
                >
                  <Checkbox
                    checked={props.selectedZoneIds.includes(zone.id)}
                    id={`domain-${zone.id}`}
                    onCheckedChange={(checked) => props.onToggleZone(zone.id, checked === true)}
                  />
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{zone.name}</span>
                    <span
                      className={
                        hasError
                          ? "shrink-0 text-xs text-destructive"
                          : "shrink-0 text-xs text-muted-foreground"
                      }
                    >
                      {hasError ? "error" : zone.status}
                    </span>
                  </span>
                </label>
                {configured ? <CompactDomainChecks result={configured} /> : null}
              </div>
            );
          })}
        </div>
      </Field>

      <WorkspaceUrlField
        domainError={props.errors.portalZoneId}
        hostname={props.appHostname}
        portalZoneId={props.portalZoneId}
        selectedZones={props.selectedZones}
        subdomainError={props.errors.appSubdomain}
        value={props.appSubdomain}
        onChange={props.setAppSubdomain}
        onDomainChange={props.setPortalZoneId}
      />
    </WizardPanel>
  );
}

function WorkspaceUrlField(props: {
  domainError?: string | undefined;
  hostname: string;
  portalZoneId: string;
  selectedZones: CloudflareZone[];
  subdomainError?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  onDomainChange: (value: string) => void;
}) {
  const invalid = Boolean(props.domainError || props.subdomainError);
  return (
    <Field data-invalid={invalid}>
      <FieldLabelRow>
        <FieldLabel htmlFor="workspace-subdomain">Workspace URL</FieldLabel>
        <div className="flex flex-col items-end gap-0.5">
          {props.subdomainError ? <FieldError>{props.subdomainError}</FieldError> : null}
          {props.domainError ? <FieldError>{props.domainError}</FieldError> : null}
        </div>
      </FieldLabelRow>
      <InputGroup data-invalid={invalid}>
        <InputGroupInput
          aria-invalid={invalid}
          autoCapitalize="none"
          id="workspace-subdomain"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <Select value={props.portalZoneId} onValueChange={props.onDomainChange}>
          <SelectTrigger
            aria-label="Workspace URL domain"
            className="h-full w-auto max-w-[65%] shrink-0 rounded-l-none border-0 border-l bg-muted/45 shadow-none focus:ring-0"
          >
            <SelectValue placeholder="Choose domain" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {props.selectedZones.map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </InputGroup>
      <FieldDescription>
        Your webmail UI will be available at {props.hostname || `${props.value}.yourdomain.com`}.
      </FieldDescription>
    </Field>
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
    <div className="ml-8 flex flex-col gap-1 pb-1 pt-1">
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

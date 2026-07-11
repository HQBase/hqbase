import { CheckCircle2, CircleAlert, Globe2, Link2 } from "lucide-react";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
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
  serviceHostname: string;
  serviceSubdomain: string;
  setAppSubdomain: (value: string) => void;
  setPortalZoneId: (value: string) => void;
  setServiceSubdomain: (value: string) => void;
  zones: CloudflareZone[];
}): React.ReactElement {
  const failed = props.results.some(({ result }) =>
    result.steps.some((step) => step.status === "failed")
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
      description="Connect every domain this workspace receives or sends email for."
      eyebrow="Domains"
      title="Connect email domains"
    >
      <Field data-invalid={Boolean(props.errors.selectedZoneIds)}>
        <FieldLabel>Email domains</FieldLabel>
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
          {props.zones.map((zone) => (
            <label
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
              htmlFor={`domain-${zone.id}`}
              key={zone.id}
            >
              <Checkbox
                checked={props.selectedZoneIds.includes(zone.id)}
                id={`domain-${zone.id}`}
                onCheckedChange={(checked) => props.onToggleZone(zone.id, checked === true)}
              />
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium">{zone.name}</span>
                <span className="text-xs text-muted-foreground">{zone.status}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldDescription>One deployment can serve all selected domains.</FieldDescription>
        {props.errors.selectedZoneIds ? (
          <FieldError>{props.errors.selectedZoneIds}</FieldError>
        ) : null}
      </Field>

      <Field data-invalid={Boolean(props.errors.portalZoneId)}>
        <FieldLabel htmlFor="portal-domain">Workspace portal domain</FieldLabel>
        <Select value={props.portalZoneId} onValueChange={props.setPortalZoneId}>
          <SelectTrigger id="portal-domain">
            <SelectValue placeholder="Choose a selected domain" />
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
        <FieldDescription>
          Admins can move the portal later. Email domains stay attached.
        </FieldDescription>
        {props.errors.portalZoneId ? <FieldError>{props.errors.portalZoneId}</FieldError> : null}
      </Field>

      <HostnameField
        id="app-subdomain"
        label="Workspace address"
        value={props.appSubdomain}
        suffix={props.portalZone?.name}
        hostname={props.appHostname}
        error={props.errors.appSubdomain}
        onChange={props.setAppSubdomain}
      />
      <HostnameField
        id="service-subdomain"
        label="Stable bridge origin"
        value={props.serviceSubdomain}
        suffix={props.portalZone?.name}
        hostname={props.serviceHostname}
        error={props.errors.serviceSubdomain}
        onChange={props.setServiceSubdomain}
      />

      <Card className="bg-background/40 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Automatic setup per domain</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <SetupOutcome icon={Globe2} text="Email Routing + DNS" />
          <SetupOutcome icon={Link2} text="Catch-all → HQBase" />
          <SetupOutcome icon={CheckCircle2} text="Outbound sending" />
          <SetupOutcome icon={CheckCircle2} text="Readiness check" />
        </CardContent>
      </Card>
      {props.connectionError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not connect every domain</AlertTitle>
          <AlertDescription>{props.connectionError}</AlertDescription>
        </Alert>
      ) : null}
      {props.results.map(({ result, zone }) => (
        <ConnectionResult key={zone.id} result={result} title={zone.name} />
      ))}
    </WizardPanel>
  );
}

function HostnameField(props: {
  id: string;
  label: string;
  value: string;
  suffix?: string | undefined;
  hostname: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <Field data-invalid={Boolean(props.error)}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <InputGroup data-invalid={Boolean(props.error)}>
        <InputGroupInput
          aria-invalid={Boolean(props.error)}
          autoCapitalize="none"
          id={props.id}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>.{props.suffix ?? "yourdomain.com"}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>{props.hostname || `${props.value}.yourdomain.com`}</FieldDescription>
      {props.error ? <FieldError>{props.error}</FieldError> : null}
    </Field>
  );
}

function SetupOutcome({ icon: Icon, text }: { icon: typeof Globe2; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/55 px-3 py-2.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span>{text}</span>
    </div>
  );
}
function ConnectionResult({ result, title }: { result: CloudflareConfigureResult; title: string }) {
  const ready = result.status.ready && result.steps.every((step) => step.status !== "failed");
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Badge variant={ready ? "secondary" : "outline"}>
          {ready ? "Ready" : "Needs attention"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {result.steps.map((step) => (
          <div className="flex items-start gap-2" key={step.id}>
            {step.status === "failed" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            )}
            <div>
              <p className="font-medium">{step.label}</p>
              <p className="break-words leading-5 text-muted-foreground">{step.message}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

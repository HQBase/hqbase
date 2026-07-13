import { CheckCircle2, CircleAlert, Globe2, Link2 } from "lucide-react";
import type * as React from "react";
import { ProUpgradeCard } from "@/components/pro-upgrade";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  onBack: () => void;
  onConnect: () => void;
  onSelect: (zoneId: string) => void;
  result: CloudflareConfigureResult | null;
  selectedZone: CloudflareZone | null;
  selectedZoneId: string;
  setAppSubdomain: (value: string) => void;
  zones: CloudflareZone[];
}): React.ReactElement {
  const failed = result?.steps.some((step) => step.status === "failed") ?? false;
  const nextLabel = isLoading ? "Connecting..." : failed ? "Retry" : "Connect domain";

  return (
    <WizardPanel
      actions={
        <WizardActions
          isLoading={isLoading}
          nextLabel={nextLabel}
          onBack={onBack}
          onNext={onConnect}
        />
      }
      description="Choose the domain for mail and your HQBase URL."
      eyebrow="Domain"
      title="Connect a domain"
    >
      <Field data-invalid={Boolean(errors.selectedZoneId)}>
        <FieldLabel htmlFor="setup-domain">Cloudflare domain</FieldLabel>
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
        {errors.selectedZoneId ? <FieldError>{errors.selectedZoneId}</FieldError> : null}
      </Field>

      {zones.length > 1 ? (
        <ProUpgradeCard
          description="Connect every domain in this Cloudflare account, choose the portal domain separately, and manage all addresses from one workspace."
          placement="onboarding-domains"
          title={`You have ${zones.length} domains. Pro can connect them together.`}
        />
      ) : null}

      <Card className="bg-background/40 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Automatic setup</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <SetupOutcome icon={Globe2} text="Email Routing + DNS" />
          <SetupOutcome icon={Link2} text="Catch-all → HQBase" />
          <SetupOutcome icon={CheckCircle2} text="Outbound sending" />
          <SetupOutcome icon={CheckCircle2} text="Readiness check" />
        </CardContent>
      </Card>

      <Field data-invalid={Boolean(errors.appSubdomain)}>
        <FieldLabel htmlFor="app-subdomain">Workspace address</FieldLabel>
        <InputGroup data-invalid={Boolean(errors.appSubdomain)}>
          <InputGroupInput
            aria-invalid={Boolean(errors.appSubdomain)}
            autoCapitalize="none"
            id="app-subdomain"
            placeholder="workspace"
            value={appSubdomain}
            onChange={(event) => setAppSubdomain(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>.{selectedZone?.name ?? "yourdomain.com"}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>URL: {appHostname || "workspace.yourdomain.com"}</FieldDescription>
        {errors.appSubdomain ? <FieldError>{errors.appSubdomain}</FieldError> : null}
      </Field>

      {connectionError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not connect the domain</AlertTitle>
          <AlertDescription>{connectionError}</AlertDescription>
        </Alert>
      ) : null}

      {result ? <ConnectionResult result={result} /> : null}
    </WizardPanel>
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

function ConnectionResult({ result }: { result: CloudflareConfigureResult }): React.ReactElement {
  const ready = result.status.ready && result.steps.every((step) => step.status !== "failed");
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium">Connection checks</CardTitle>
        <Badge variant={ready ? "secondary" : "outline"}>
          {ready ? "Ready" : "Needs attention"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {result.steps.map((step) => {
          const ok = step.status === "success" || step.status === "skipped";
          return (
            <div className="flex items-start gap-2" key={step.id}>
              {ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className="font-medium">{step.label}</p>
                <p className="break-words leading-5 text-muted-foreground">{step.message}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

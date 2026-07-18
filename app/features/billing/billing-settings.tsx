import { ArrowUpRight, RefreshCw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLabelRow
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { activateEntitlement, refreshEntitlement } from "./api";
import type { EntitlementStatus } from "./types";

export function BillingSettings({
  status,
  onChanged
}: {
  status: EntitlementStatus;
  onChanged: (status: EntitlementStatus) => void;
}): React.ReactElement {
  const [licenseKey, setLicenseKey] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<"activate" | "refresh" | null>(null);
  const [activationError, setActivationError] = React.useState<string | null>(null);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const activationErrorId = "pro-license-key-error";

  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActivationError(null);
    setPendingAction("activate");
    try {
      const next = await activateEntitlement({ licenseKey, hostname: window.location.hostname });
      setLicenseKey("");
      onChanged(next);
      toast.success("HQBase Pro license activated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "License activation failed.";
      setActivationError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function refresh() {
    setRefreshError(null);
    setPendingAction("refresh");
    try {
      const next = await refreshEntitlement();
      onChanged(next);
      if (next.lastError) {
        const message =
          "The subscription check could not be completed. Access remains based on the last verified status.";
        setRefreshError(message);
        toast.error(message);
      } else {
        toast.success("Subscription status refreshed.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Subscription refresh failed.";
      setRefreshError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  const isPending = pendingAction !== null;
  const statusDiagnostic =
    refreshError ??
    (status.lastError
      ? "The last subscription check could not be completed. Access remains based on the last verified status."
      : null);

  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium">HQBase Pro</CardTitle>
          <Badge
            aria-label={`License status: ${label(status.state)}`}
            role="status"
            variant={status.canConfigure ? "secondary" : "destructive"}
          >
            {label(status.state)}
          </Badge>
        </div>
        <CardDescription>
          One production workspace, unlimited users and domains, plus local and staging activations.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {statusDiagnostic ? (
          <Alert variant={refreshError ? "destructive" : "default"}>
            <AlertTitle>Subscription check needs attention</AlertTitle>
            <AlertDescription>{statusDiagnostic}</AlertDescription>
          </Alert>
        ) : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <StatusItem label="License" value={status.displayKey ?? "Not activated"} />
          <StatusItem
            label="Paid through"
            value={status.currentPeriodEnd ? formatDate(status.currentPeriodEnd) : "—"}
          />
          <StatusItem
            label="Last checked"
            value={status.checkedAt ? formatDateTime(status.checkedAt) : "Never"}
          />
        </dl>
        <form
          className="rounded-md border bg-background/50 p-4"
          onSubmit={(event) => void activate(event)}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(activationError)}>
              <FieldLabelRow>
                <FieldLabel htmlFor="pro-license-key">License key</FieldLabel>
                {activationError ? (
                  <FieldError id={activationErrorId}>{activationError}</FieldError>
                ) : null}
              </FieldLabelRow>
              <Input
                aria-describedby={activationError ? activationErrorId : undefined}
                aria-invalid={Boolean(activationError)}
                autoCapitalize="none"
                autoComplete="off"
                id="pro-license-key"
                placeholder="HQB_…"
                required
                type="password"
                value={licenseKey}
                onChange={(event) => {
                  setLicenseKey(event.target.value);
                  setActivationError(null);
                }}
              />
              <FieldDescription>
                The key is encrypted before storage and is never written to logs.
              </FieldDescription>
            </Field>
            <Button disabled={isPending} type="submit">
              {pendingAction === "activate"
                ? status.displayKey
                  ? "Replacing license…"
                  : "Activating license…"
                : status.displayKey
                  ? "Replace license"
                  : "Activate license"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 border-t pt-4 sm:flex-row sm:items-center">
        <Button
          disabled={isPending || !status.displayKey}
          className="w-full sm:w-auto"
          type="button"
          variant="outline"
          onClick={() => void refresh()}
        >
          <RefreshCw data-icon="inline-start" />
          {pendingAction === "refresh" ? "Refreshing status…" : "Refresh status"}
        </Button>
        <Button asChild className="w-full sm:w-auto" variant="ghost">
          <a href="https://polar.sh/hqbase/portal" rel="noreferrer" target="_blank">
            Manage subscription
            <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}

function StatusItem({ label: itemLabel, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/45 p-3">
      <dt className="text-xs text-muted-foreground">{itemLabel}</dt>
      <dd className="mt-1 truncate font-medium">{value}</dd>
    </div>
  );
}

function label(state: EntitlementStatus["state"]): string {
  return {
    unlicensed: "Not activated",
    active: "Active",
    canceling: "Canceling",
    past_due: "Past due",
    grace: "Grace period",
    inactive: "Inactive"
  }[state];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

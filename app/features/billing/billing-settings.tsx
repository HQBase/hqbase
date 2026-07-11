import { ArrowUpRight, RefreshCw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
  const [isPending, setIsPending] = React.useState(false);

  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    try {
      const next = await activateEntitlement({ licenseKey, hostname: window.location.hostname });
      setLicenseKey("");
      onChanged(next);
      toast.success("HQBase Pro license activated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "License activation failed.");
    } finally {
      setIsPending(false);
    }
  }

  async function refresh() {
    setIsPending(true);
    try {
      const next = await refreshEntitlement();
      onChanged(next);
      toast.success("Subscription status refreshed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subscription refresh failed.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium">HQBase Pro</CardTitle>
          <Badge variant={status.canConfigure ? "secondary" : "destructive"}>
            {label(status.state)}
          </Badge>
        </div>
        <CardDescription>
          One production workspace, unlimited users and domains, plus local and staging activations.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
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
            <Field>
              <FieldLabel htmlFor="pro-license-key">License key</FieldLabel>
              <Input
                autoCapitalize="none"
                autoComplete="off"
                id="pro-license-key"
                placeholder="HQB_…"
                required
                type="password"
                value={licenseKey}
                onChange={(event) => setLicenseKey(event.target.value)}
              />
              <FieldDescription>
                The key is encrypted before storage and is never written to logs.
              </FieldDescription>
            </Field>
            <Button disabled={isPending} type="submit">
              {isPending ? "Checking…" : status.displayKey ? "Replace license" : "Activate license"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="gap-2 border-t pt-4">
        <Button
          disabled={isPending || !status.displayKey}
          type="button"
          variant="outline"
          onClick={() => void refresh()}
        >
          <RefreshCw data-icon="inline-start" />
          Refresh status
        </Button>
        <Button asChild variant="ghost">
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
  return state.replace("_", " ");
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

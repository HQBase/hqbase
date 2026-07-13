import { Check, Circle, ShieldCheck } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EntitlementStatus } from "@/features/billing/types";
import { verifyUpgradeCutover } from "./api";
import type { UpgradeLifecycle } from "./types";

export function UpgradeSettings({
  entitlement,
  lifecycle,
  onChanged
}: {
  entitlement: EntitlementStatus;
  lifecycle: UpgradeLifecycle;
  onChanged: (next: UpgradeLifecycle) => void;
}): React.ReactElement {
  const [apiToken, setApiToken] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [verificationError, setVerificationError] = React.useState<string | null>(null);
  const verified = lifecycle.state === "cutover_verified";
  const tokenDescriptionId = "upgrade-cloudflare-token-description";
  const tokenErrorId = "upgrade-cloudflare-token-error";

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerificationError(null);
    setPending(true);
    try {
      const next = await verifyUpgradeCutover(apiToken);
      setApiToken("");
      onChanged(next);
      toast.success("Community to Pro cutover verified.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cutover verification failed.";
      setVerificationError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="bg-card/70 shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Community upgrade</CardTitle>
            <Badge variant={verified ? "secondary" : "outline"}>
              {verified ? "Verified" : "Cutover pending"}
            </Badge>
          </div>
          <CardDescription>
            Community remains the fallback until license, domains, portal, sending, and receiving
            are verified on {lifecycle.targetWorkerName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="flex flex-col gap-3" aria-label="Community upgrade progress">
            <UpgradeStep complete label="Customer-owned D1 checkpoint created" />
            <UpgradeStep complete label="SQL backup copied to the existing R2 bucket" />
            <UpgradeStep complete={lifecycle.state !== "migrated"} label="Pro Worker deployed" />
            <UpgradeStep
              complete={entitlement.state !== "unlicensed" && entitlement.state !== "inactive"}
              label="Pro license activated"
            />
            <UpgradeStep complete={verified} label="Portal and mail routing verified on Pro" />
          </ol>
          <dl className="grid gap-3 rounded-md border bg-background/45 p-4 text-xs sm:grid-cols-2">
            <RecordItem label="Rollback bookmark" value={lifecycle.checkpointBookmark} />
            <RecordItem label="R2 backup" value={lifecycle.backupR2Key} />
            <RecordItem
              label="Community Worker"
              value={lifecycle.sourceWorkerName ?? "Not recorded"}
            />
            <RecordItem label="Pro Worker" value={lifecycle.targetWorkerName} />
          </dl>
        </CardContent>
      </Card>

      {!verified ? (
        <Card className="bg-card/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Verify cutover</CardTitle>
            <CardDescription>
              First activate Billing and reconnect the migrated domain under Domains. Then use the
              same temporary Cloudflare token to verify every enabled domain routes to Pro.
            </CardDescription>
          </CardHeader>
          <form onSubmit={(event) => void verify(event)}>
            <CardContent className="flex flex-col gap-4">
              <Field data-invalid={Boolean(verificationError)}>
                <FieldLabel htmlFor="upgrade-cloudflare-token">
                  Temporary Cloudflare API token
                </FieldLabel>
                <Input
                  aria-describedby={`${tokenDescriptionId}${verificationError ? ` ${tokenErrorId}` : ""}`}
                  aria-invalid={Boolean(verificationError)}
                  autoCapitalize="none"
                  autoComplete="off"
                  id="upgrade-cloudflare-token"
                  minLength={20}
                  required
                  type="password"
                  value={apiToken}
                  onChange={(event) => {
                    setApiToken(event.target.value);
                    setVerificationError(null);
                  }}
                />
                <FieldDescription id={tokenDescriptionId}>
                  The token is used for this check and is never stored.
                </FieldDescription>
                {verificationError ? (
                  <FieldError id={tokenErrorId}>{verificationError}</FieldError>
                ) : null}
              </Field>
              <Button disabled={pending || apiToken.length < 20} type="submit">
                <ShieldCheck data-icon="inline-start" />
                {pending ? "Verifying Pro cutover…" : "Verify Pro cutover"}
              </Button>
            </CardContent>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function UpgradeStep({ complete, label }: { complete: boolean; label: string }) {
  const Icon = complete ? Check : Circle;
  return (
    <li className="flex items-center gap-3 text-sm">
      <Icon
        aria-hidden="true"
        className={complete ? "text-foreground" : "text-muted-foreground"}
        size={16}
      />
      <span
        className={
          complete ? "min-w-0 flex-1 text-foreground" : "min-w-0 flex-1 text-muted-foreground"
        }
      >
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{complete ? "Complete" : "Pending"}</span>
    </li>
  );
}

function RecordItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-mono" title={value}>
        {value}
      </dd>
    </div>
  );
}

import { Check, Circle, ShieldCheck } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [pending, setPending] = React.useState(false);
  const [verificationError, setVerificationError] = React.useState<string | null>(null);
  const verified = lifecycle.state === "cutover_verified";
  const inPlace = lifecycle.sourceWorkerName === lifecycle.targetWorkerName;

  async function verify() {
    setVerificationError(null);
    setPending(true);
    try {
      const next = await verifyUpgradeCutover();
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
              {verified ? "Complete" : inPlace ? "Promotion pending" : "Cutover pending"}
            </Badge>
          </div>
          <CardDescription>
            {inPlace
              ? `This workspace was promoted in place on ${lifecycle.targetWorkerName}. Its Worker identity, storage, domains, users, sessions, and mail were preserved.`
              : `Community remains the fallback until license, domains, portal, sending, and receiving are verified on ${lifecycle.targetWorkerName}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="flex flex-col gap-3" aria-label="Community upgrade progress">
            <UpgradeStep complete label="Customer-owned D1 checkpoint created" />
            <UpgradeStep complete label="SQL backup copied to the existing R2 bucket" />
            <UpgradeStep
              complete={lifecycle.state !== "migrated"}
              label={
                inPlace ? "Signed Pro version promoted on the same Worker" : "Pro Worker deployed"
              }
            />
            <UpgradeStep
              complete={entitlement.state !== "unlicensed" && entitlement.state !== "inactive"}
              label="Pro license activated"
            />
            <UpgradeStep
              complete={verified}
              label={
                inPlace
                  ? "Original workspace origin and resources verified"
                  : "Portal and mail routing verified on Pro"
              }
            />
          </ol>
          <dl className="grid gap-3 rounded-md border bg-background/45 p-4 text-xs sm:grid-cols-2">
            <RecordItem label="Rollback bookmark" value={lifecycle.checkpointBookmark} />
            <RecordItem label="R2 backup" value={lifecycle.backupR2Key} />
            <RecordItem
              label={inPlace ? "Previous Community version on Worker" : "Community Worker"}
              value={lifecycle.sourceWorkerName ?? "Not recorded"}
            />
            <RecordItem
              label={inPlace ? "Active Pro Worker" : "Pro Worker"}
              value={lifecycle.targetWorkerName}
            />
          </dl>
        </CardContent>
      </Card>

      {!verified && !inPlace ? (
        <Card className="bg-card/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Verify cutover</CardTitle>
            <CardDescription>
              HQBase reuses the temporary installation grant to verify every enabled domain routes
              to Pro. No API token is required.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {verificationError ? (
              <p className="text-sm text-destructive">{verificationError}</p>
            ) : null}
            <Button disabled={pending} type="button" onClick={() => void verify()}>
              <ShieldCheck data-icon="inline-start" />
              {pending ? "Verifying Pro cutover…" : "Verify Pro cutover"}
            </Button>
          </CardContent>
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

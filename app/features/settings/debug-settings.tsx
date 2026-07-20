import { ShieldCheck } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EntitlementStatus } from "@/features/billing/types";
import { SettingsSection } from "@/features/settings/settings-section";
import type { SetupStatus } from "@/features/setup/types";
import { verifyUpgradeCutover } from "@/features/upgrades/api";
import type { UpgradeLifecycle } from "@/features/upgrades/types";

type DebugSettingsProps = {
  setup: SetupStatus;
  entitlement: EntitlementStatus | null;
  upgrade: UpgradeLifecycle | null;
  onUpgradeChanged: (upgrade: UpgradeLifecycle) => void;
};

export function DebugSettings({
  setup,
  entitlement,
  upgrade,
  onUpgradeChanged
}: DebugSettingsProps): React.ReactElement {
  const [pending, setPending] = React.useState(false);
  const [verificationError, setVerificationError] = React.useState<string | null>(null);
  const requiresVerification = Boolean(
    upgrade &&
      upgrade.state !== "cutover_verified" &&
      upgrade.sourceWorkerName !== upgrade.targetWorkerName
  );

  async function verify() {
    setVerificationError(null);
    setPending(true);
    try {
      const next = await verifyUpgradeCutover();
      onUpgradeChanged(next);
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
    <SettingsSection description="Read-only deployment and upgrade diagnostics" title="Debug">
      <Textarea
        aria-label="HQBase Pro debug report"
        className="min-h-[30rem] resize-y bg-muted/30 font-mono text-xs leading-5 shadow-none"
        readOnly
        spellCheck={false}
        value={buildDebugReport(setup, entitlement, upgrade)}
      />
      {verificationError ? (
        <Alert variant="destructive">
          <AlertTitle>Cutover verification failed</AlertTitle>
          <AlertDescription>{verificationError}</AlertDescription>
        </Alert>
      ) : null}
      {requiresVerification ? (
        <div className="flex flex-col items-start gap-2">
          <Button disabled={pending} type="button" onClick={() => void verify()}>
            <ShieldCheck data-icon="inline-start" />
            {pending ? "Verifying Pro cutover…" : "Verify Pro cutover"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Uses the temporary installation authorization. No customer credential is required.
          </p>
        </div>
      ) : null}
    </SettingsSection>
  );
}

export function buildDebugReport(
  setup: SetupStatus,
  entitlement: EntitlementStatus | null,
  upgrade: UpgradeLifecycle | null
): string {
  const lines = [
    "# workspace",
    'edition = "pro"',
    `setup_complete = ${setup.isComplete}`,
    `primary_domain = ${quoted(setup.primaryDomain)}`,
    `portal_hostname = ${quoted(setup.portalHostname)}`,
    `domain_setup = ${quoted(setup.checklistAcknowledged ? "ready" : "pending")}`,
    `users = ${setup.userCount}`,
    `mailboxes = ${setup.mailboxCount}`,
    `domains = ${JSON.stringify(setup.domains.map((domain) => domain.name))}`,
    "",
    "# entitlement",
    `state = ${quoted(entitlement?.state ?? null)}`,
    `installation_id = ${quoted(entitlement?.installationId ?? null)}`,
    `paid_through = ${quoted(entitlement?.currentPeriodEnd ?? null)}`,
    `last_checked = ${quoted(entitlement?.checkedAt ?? null)}`,
    "",
    "# community_upgrade"
  ];

  if (!upgrade) {
    lines.push("present = false");
    return lines.join("\n");
  }

  const inPlace = upgrade.sourceWorkerName === upgrade.targetWorkerName;
  lines.push(
    "present = true",
    `state = ${quoted(upgrade.state)}`,
    `mode = ${quoted(inPlace ? "in_place" : "worker_cutover")}`,
    `source_worker = ${quoted(upgrade.sourceWorkerName)}`,
    `target_worker = ${quoted(upgrade.targetWorkerName)}`,
    `checkpoint_bookmark = ${quoted(upgrade.checkpointBookmark)}`,
    `backup_r2_key = ${quoted(upgrade.backupR2Key)}`,
    `started_at = ${quoted(upgrade.startedAt)}`,
    `migrated_at = ${quoted(upgrade.migratedAt)}`,
    `deployed_at = ${quoted(upgrade.deployedAt)}`,
    `cutover_verified_at = ${quoted(upgrade.cutoverVerifiedAt)}`,
    `updated_at = ${quoted(upgrade.updatedAt)}`
  );
  return lines.join("\n");
}

function quoted(value: string | null): string {
  return value === null ? "null" : JSON.stringify(value);
}

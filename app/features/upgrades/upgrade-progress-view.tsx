import { Check, Circle, Cloud, LoaderCircle } from "lucide-react";
import type * as React from "react";

import { Accordion } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SetupFrame } from "@/features/setup/setup-frame";
import { OnboardingStep } from "@/features/setup/setup-wizard-parts";

import type { UpgradeState, UpgradeStatus } from "./types";

export const upgradeProgress = [
  ["Purchase verified", "purchase_verified"],
  ["Community installation found", "target_verified"],
  ["Workspace backed up", "backup_complete"],
  ["Pro infrastructure prepared", "resources_prepared"],
  ["Database migrated", "migration_complete"],
  ["Pro version verified", "candidate_verified"],
  ["Upgrade complete", "complete"]
] as const;

type ProgressState = (typeof upgradeProgress)[number][1];

export function UpgradeAuthorizeView({
  busy,
  error,
  onAuthorize
}: {
  busy: boolean;
  error: string | null;
  onAuthorize: () => void;
}): React.ReactElement {
  return (
    <UpgradeShell progress="1 / 7">
      <Accordion aria-label="Upgrade progress" type="single" value="authorize" collapsible>
        <OnboardingStep
          description="Checkout verified by HQBase Billing."
          icon={Check}
          status="complete"
          title="Purchase verified"
          value="purchase"
        />
        <OnboardingStep
          description="Grant temporary access to this Cloudflare account."
          icon={Cloud}
          status={error ? "failed" : "current"}
          title="Authorize Cloudflare"
          value="authorize"
        >
          <div className="flex flex-col items-start gap-4">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              HQBase will securely detect the existing resources, back up the workspace, and promote
              this Worker in place.
            </p>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Authorization needs attention</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button disabled={busy} type="button" onClick={onAuthorize}>
              {busy ? "Opening Cloudflare…" : "Authorize Cloudflare and upgrade"}
            </Button>
          </div>
        </OnboardingStep>
        {upgradeProgress.slice(1).map(([label, required]) => (
          <OnboardingStep
            description={upgradeDescription(required)}
            disabled
            icon={Circle}
            key={required}
            status="upcoming"
            title={label}
            value={required}
          />
        ))}
      </Accordion>
    </UpgradeShell>
  );
}

export function UpgradeAttentionView({ onReturn }: { onReturn: () => void }): React.ReactElement {
  return (
    <UpgradeShell progress="1 / 7">
      <Accordion aria-label="Upgrade progress" type="single" value="session" collapsible>
        <OnboardingStep
          description="The purchase or authorization session expired."
          icon={Circle}
          status="failed"
          title="Upgrade needs attention"
          value="session"
        >
          <div className="flex flex-col items-start gap-4">
            <Alert variant="destructive">
              <AlertTitle>Community was not changed</AlertTitle>
              <AlertDescription>Return to Settings and start the upgrade again.</AlertDescription>
            </Alert>
            <Button type="button" variant="outline" onClick={onReturn}>
              Return to workspace
            </Button>
          </div>
        </OnboardingStep>
      </Accordion>
    </UpgradeShell>
  );
}

export function UpgradeProgressView({
  active,
  busy,
  completed,
  error,
  needsSignIn,
  onAuthorize,
  onRetry,
  onSignIn,
  status
}: {
  active: string;
  busy: boolean;
  completed: number;
  error: string | null;
  needsSignIn: boolean;
  onAuthorize: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  status: UpgradeStatus | null;
}): React.ReactElement {
  return (
    <UpgradeShell progress={`${completed} / ${upgradeProgress.length}`}>
      <Accordion aria-label="Upgrade progress" type="single" value={active} collapsible>
        {upgradeProgress.map(([label, required]) => {
          const done = status ? reached(status.state, required) : false;
          const current = status
            ? nextStep(status.state, required)
            : required === "purchase_verified";
          const failed = Boolean(error && active === required);
          const Icon = done ? Check : current ? LoaderCircle : Circle;
          return (
            <OnboardingStep
              description={upgradeDescription(required)}
              disabled={!done && !current && !failed}
              icon={Icon}
              key={required}
              status={done ? "complete" : failed ? "failed" : current ? "current" : "upcoming"}
              title={label}
              value={required}
            >
              {current || failed ? (
                <StepFeedback
                  busy={busy}
                  error={error}
                  needsSignIn={needsSignIn}
                  onAuthorize={onAuthorize}
                  onRetry={onRetry}
                  onSignIn={onSignIn}
                  recoveryAction={status?.recoveryAction ?? null}
                />
              ) : done ? (
                <p className="text-sm text-muted-foreground">
                  This checkpoint is stored and safe to review.
                </p>
              ) : null}
            </OnboardingStep>
          );
        })}
      </Accordion>
    </UpgradeShell>
  );
}

function StepFeedback({
  busy,
  error,
  needsSignIn,
  onAuthorize,
  onRetry,
  onSignIn,
  recoveryAction
}: {
  busy: boolean;
  error: string | null;
  needsSignIn: boolean;
  onAuthorize: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  recoveryAction: string | null;
}): React.ReactElement {
  if (!error)
    return (
      <p className="text-sm text-muted-foreground">
        HQBase is working on this checkpoint. You can safely reload this page.
      </p>
    );
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert variant="destructive">
        <AlertTitle>This step needs attention</AlertTitle>
        <AlertDescription>
          {error}
          {recoveryAction ? ` ${recoveryAction}` : ""}
        </AlertDescription>
      </Alert>
      {recoveryAction?.startsWith("Authorize Cloudflare") ? (
        <Button disabled={busy} type="button" onClick={onAuthorize}>
          Authorize Cloudflare again
        </Button>
      ) : null}
      {needsSignIn ? (
        <Button disabled={busy} type="button" onClick={onSignIn}>
          Sign in again
        </Button>
      ) : (
        <Button disabled={busy} type="button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function UpgradeShell({
  children,
  progress
}: {
  children: React.ReactNode;
  progress: string;
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background">
      <SetupFrame
        description="Your users, mail, domains, and Cloudflare resources stay attached throughout this resumable upgrade."
        progress={progress}
        title="Upgrade this workspace to Pro"
      >
        {children}
      </SetupFrame>
    </div>
  );
}

export function activeProgress(status: UpgradeStatus | null): string {
  if (!status) return "purchase_verified";
  return (
    upgradeProgress.find(([, required]) => nextStep(status.state, required))?.[1] ??
    upgradeProgress.find(([, required]) => !reached(status.state, required))?.[1] ??
    "complete"
  );
}

export function reached(current: UpgradeState, required: UpgradeState): boolean {
  if (current === "failed" || current === "recovery_required") return false;
  return stateOrder.indexOf(current) >= stateOrder.indexOf(required);
}

function nextStep(current: UpgradeState, required: UpgradeState): boolean {
  const index = stateOrder.indexOf(current);
  return index >= 0 && stateOrder.indexOf(required) === index + 1;
}

function upgradeDescription(state: ProgressState): string {
  return {
    purchase_verified: "Checkout and installation identity verified.",
    target_verified: "The exact Community Worker and bindings are verified.",
    backup_complete: "D1 bookmark and SQL backup recorded.",
    resources_prepared: "Pro queues, bindings, and secrets prepared.",
    migration_complete: "The additive database migration is verified.",
    candidate_verified: "The signed Pro release passed isolated validation.",
    complete: "The same workspace is now running HQBase Pro."
  }[state];
}

const stateOrder: UpgradeState[] = [
  "created",
  "purchase_verified",
  "cloudflare_authorized",
  "target_verified",
  "backup_complete",
  "resources_prepared",
  "candidate_uploaded",
  "migration_started",
  "migration_complete",
  "candidate_verified",
  "promoted",
  "complete"
];

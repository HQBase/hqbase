import { Check, Circle, LoaderCircle, ShieldCheck } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/features/auth/api";
import { ApiRequestError } from "@/lib/api-client";
import { advanceProUpgrade, getProUpgradeStatus, startProUpgradeOAuth } from "./api";
import type { UpgradeState, UpgradeStatus } from "./types";

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

const progress = [
  ["Purchase verified", "purchase_verified"],
  ["Community installation found", "target_verified"],
  ["Workspace backed up", "backup_complete"],
  ["Pro infrastructure prepared", "resources_prepared"],
  ["Database migrated", "migration_complete"],
  ["Pro version verified", "candidate_verified"],
  ["Upgrade complete", "complete"]
] as const;

export function UpgradeExperience(): React.ReactElement | null {
  const result = new URLSearchParams(window.location.search).get("upgrade");
  const [status, setStatus] = React.useState<UpgradeStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (result !== "progress") return;
    void getProUpgradeStatus()
      .then(setStatus)
      .catch((reason) => captureError(reason, setError, setErrorCode));
  }, [result]);

  React.useEffect(() => {
    if (!status || busy || error || terminal(status.state)) return;
    if (shouldReloadForProCompletion(status.state)) {
      const timer = window.setTimeout(() => window.location.reload(), 500);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError(null);
      setErrorCode(null);
      void advanceProUpgrade()
        .then(setStatus)
        .catch(async (reason) => {
          captureError(reason, setError, setErrorCode);
          await getProUpgradeStatus()
            .then(setStatus)
            .catch(() => undefined);
        })
        .finally(() => setBusy(false));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [busy, error, status]);

  if (!result) return null;
  if (result === "authorize") {
    return (
      <UpgradeFrame>
        <ShieldCheck className="size-7" />
        <CardTitle>Upgrade this workspace to Pro</CardTitle>
        <CardDescription className="max-w-xl leading-5">
          Purchase verified. Authorize Cloudflare once so HQBase can securely detect your existing
          resources, back up the workspace, and promote this Worker in place.
        </CardDescription>
        <Button
          disabled={busy}
          type="button"
          onClick={() => void beginCloudflareAuthorization(setBusy, setError, setErrorCode)}
        >
          {busy ? "Opening Cloudflare…" : "Authorize Cloudflare and upgrade"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </UpgradeFrame>
    );
  }
  if (result !== "progress") {
    return (
      <UpgradeFrame>
        <CardTitle>Upgrade needs attention</CardTitle>
        <CardDescription>
          The purchase or authorization session expired. Return to Settings and start the upgrade
          again; Community was not changed.
        </CardDescription>
        <Button type="button" variant="outline" onClick={() => window.location.assign("/")}>
          Return to workspace
        </Button>
      </UpgradeFrame>
    );
  }
  return (
    <UpgradeFrame>
      <CardTitle>Upgrading this workspace to Pro</CardTitle>
      <CardDescription>
        Keep this page open. You can safely reload; every completed step is stored in the workspace.
      </CardDescription>
      <ol className="grid gap-3 py-2">
        {progress.map(([label, required]) => {
          const done = status ? reached(status.state, required) : false;
          const Icon = done
            ? Check
            : status && activeStep(status.state, required)
              ? LoaderCircle
              : Circle;
          return (
            <li className="flex items-center gap-3 text-sm" key={required}>
              <Icon className={done ? "size-4 text-emerald-600" : "size-4 text-muted-foreground"} />
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
      {error ? (
        <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p>{error}</p>
          {status?.recoveryAction ? (
            <p className="text-muted-foreground">{status.recoveryAction}</p>
          ) : null}
          {status?.recoveryAction?.startsWith("Authorize Cloudflare") ? (
            <Button
              disabled={busy}
              type="button"
              onClick={() => void beginCloudflareAuthorization(setBusy, setError, setErrorCode)}
            >
              Authorize Cloudflare again
            </Button>
          ) : null}
          {requiresUpgradeSignIn(errorCode) ? (
            <Button
              disabled={busy}
              type="button"
              onClick={() => {
                setBusy(true);
                void signOut().finally(() => window.location.reload());
              }}
            >
              Sign in again
            </Button>
          ) : null}
          {!requiresUpgradeSignIn(errorCode) ? (
            <Button
              disabled={busy}
              type="button"
              variant="outline"
              onClick={() => retryUpgradeStep(setError, setErrorCode, setStatus)}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </UpgradeFrame>
  );
}

export function requiresUpgradeSignIn(errorCode: string | null): boolean {
  return errorCode === "UNAUTHENTICATED" || errorCode === "RECENT_AUTH_REQUIRED";
}

export function shouldReloadForProCompletion(state: UpgradeState): boolean {
  return state === "promoted";
}

export function retryUpgradeStep(
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  setErrorCode: React.Dispatch<React.SetStateAction<string | null>>,
  setStatus: React.Dispatch<React.SetStateAction<UpgradeStatus | null>>
): void {
  setError(null);
  setErrorCode(null);
  setStatus((current) => (current ? { ...current } : current));
}

function UpgradeFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-background/95 p-4">
      <Card className="w-full max-w-2xl shadow-sm">
        <CardHeader className="gap-3">{children}</CardHeader>
        <CardContent />
      </Card>
    </main>
  );
}

function reached(current: UpgradeState, required: UpgradeState): boolean {
  if (current === "failed" || current === "recovery_required") return false;
  return stateOrder.indexOf(current) >= stateOrder.indexOf(required);
}

function activeStep(current: UpgradeState, required: UpgradeState): boolean {
  const index = stateOrder.indexOf(current);
  return index >= 0 && stateOrder.indexOf(required) === index + 1;
}

function terminal(state: UpgradeState): boolean {
  return ["complete", "failed", "recovery_required"].includes(state);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "This upgrade step could not continue.";
}

function captureError(
  error: unknown,
  setError: (error: string | null) => void,
  setErrorCode: (code: string | null) => void
): void {
  setError(message(error));
  setErrorCode(error instanceof ApiRequestError ? error.code : null);
}

async function beginCloudflareAuthorization(
  setBusy: (busy: boolean) => void,
  setError: (error: string | null) => void,
  setErrorCode: (code: string | null) => void
): Promise<void> {
  setBusy(true);
  setError(null);
  setErrorCode(null);
  try {
    const authorization = await startProUpgradeOAuth();
    window.location.assign(authorization.authorizeUrl);
  } catch (error) {
    captureError(error, setError, setErrorCode);
    setBusy(false);
  }
}

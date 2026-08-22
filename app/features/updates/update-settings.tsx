import * as React from "react";
import { PiArrowRight, PiArrowsClockwise } from "react-icons/pi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CloudflareAuthorizationDialog } from "@/features/settings/cloudflare-authorization-dialog";
import { SettingsSection } from "@/features/settings/settings-section";
import { applyUpdate, getUpdateStatus } from "./api";
import type { UpdateStatus } from "./types";
import type { UpdateProgress } from "./update-progress";

export function UpdateSettings({
  initialStatus,
  progress,
  onStatusChange,
  onUpdateStarted
}: {
  initialStatus: UpdateStatus | null;
  progress: UpdateProgress | null;
  onStatusChange: (status: UpdateStatus) => void;
  onUpdateStarted: (buildId: string) => void;
}): React.ReactElement {
  const [status, setStatus] = React.useState(initialStatus);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<"check" | "apply" | null>(null);
  const [authorizationOpen, setAuthorizationOpen] = React.useState(false);
  const resumedRef = React.useRef(false);

  React.useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  React.useEffect(() => {
    if (resumedRef.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("reauth") === "required") {
      resumedRef.current = true;
      url.searchParams.delete("reauth");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      setAuthorizationOpen(true);
      return;
    }
    const oauthResult = url.searchParams.get("cloudflare");
    if (!oauthResult || url.searchParams.get("settings") !== "updates") return;
    resumedRef.current = true;
    url.searchParams.delete("cloudflare");
    url.searchParams.delete("settings");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    if (oauthResult !== "connected") {
      setApplyError(oauthErrorMessage(oauthResult));
      return;
    }

    setPendingAction("apply");
    void applyUpdate()
      .then((result) => onUpdateStarted(result.buildId))
      .catch((nextError: unknown) => {
        setApplyError(nextError instanceof Error ? nextError.message : "Update could not start.");
      })
      .finally(() => setPendingAction(null));
  }, [onUpdateStarted]);

  async function check(): Promise<void> {
    setPendingAction("check");
    setCheckError(null);
    try {
      const nextStatus = await getUpdateStatus();
      setStatus(nextStatus);
      onStatusChange(nextStatus);
    } catch (nextError) {
      setCheckError(nextError instanceof Error ? nextError.message : "Update check failed.");
    } finally {
      setPendingAction(null);
    }
  }
  const isPending = pendingAction !== null;

  return (
    <SettingsSection description="Signed stable releases" title="Updates">
      {checkError ? (
        <Alert variant="destructive">
          <AlertTitle>Update check unavailable</AlertTitle>
          <AlertDescription>{checkError}</AlertDescription>
        </Alert>
      ) : null}
      {applyError ? (
        <Alert variant="destructive">
          <AlertTitle>Update authorization unavailable</AlertTitle>
          <AlertDescription>{applyError}</AlertDescription>
        </Alert>
      ) : null}
      {progress ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-border/80 bg-muted/25 p-4 sm:p-5"
          role="status"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
              <Spinner aria-hidden="true" className="size-4 text-foreground" role="presentation" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium">Update in progress</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {status?.release.version
                  ? `HQBase ${status.release.version} is being deployed. `
                  : "The new version is being deployed. "}
                You can keep working while Cloudflare finishes the build.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span>Cloudflare build</span>
                <code className="rounded bg-background px-1.5 py-0.5 font-mono text-foreground ring-1 ring-border">
                  {progress.buildId}
                </code>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div
        aria-live="polite"
        className="flex flex-col gap-3 border-y py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <Version label="Current" value={status?.installedVersion ?? "Unknown"} />
          <PiArrowRight
            aria-hidden="true"
            className="pointer-events-none size-3.5 text-muted-foreground/70"
          />
          <Version label="Available" value={status?.release.version ?? "Not checked"} />
        </div>
        <Button
          className="self-start sm:self-auto"
          disabled={isPending}
          onClick={() => void check()}
          size="sm"
          type="button"
          variant="ghost"
        >
          {pendingAction === "check" ? (
            <>
              <Spinner aria-hidden="true" role="presentation" />
              Checking…
            </>
          ) : (
            <>
              <PiArrowsClockwise aria-hidden="true" className="pointer-events-none" />
              Check updates
            </>
          )}
        </Button>
      </div>
      {status?.available && !progress ? (
        <div className="flex flex-col gap-4 pt-1">
          <div>
            <h3 className="text-sm font-medium">Apply update</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              HQBase verifies the artifact, records the Worker version and D1 bookmark, migrates,
              deploys, and verifies before reporting success.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {!status.compatible ? (
              <Alert variant="destructive">
                <AlertTitle>Direct update unavailable</AlertTitle>
                <AlertDescription>
                  This release cannot update directly from the installed version.
                </AlertDescription>
              </Alert>
            ) : null}
            {isPending ? (
              <Button className="self-start" disabled type="button">
                Starting update…
              </Button>
            ) : !status.compatible ? (
              <Button className="self-start" disabled type="button">
                Install update
              </Button>
            ) : (
              <Button
                className="self-start"
                onClick={() => setAuthorizationOpen(true)}
                type="button"
              >
                Install update
              </Button>
            )}
          </div>
        </div>
      ) : null}
      <CloudflareAuthorizationDialog
        authorizeHref="/api/updates/cloudflare/oauth/start"
        description="To install this update, HQBase needs temporary access to your Cloudflare account. You’ll return to Updates automatically, and HQBase will start the update."
        open={authorizationOpen}
        onOpenChange={setAuthorizationOpen}
      />
    </SettingsSection>
  );
}

function oauthErrorMessage(result: string): string {
  if (result === "denied") return "Cloudflare authorization was cancelled.";
  if (result === "invalid") return "Cloudflare authorization expired. Please try again.";
  return "Cloudflare could not authorize the update. Ask a Cloudflare administrator to allow HQBase or configure customer-managed OAuth from the deployment guide.";
}

function Version({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}

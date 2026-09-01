import * as React from "react";
import { PiArrowRight, PiArrowsClockwise } from "react-icons/pi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CloudflareAuthorizationDialog } from "@/features/settings/cloudflare-authorization-dialog";
import { SettingsSection } from "@/features/settings/settings-section";
import { applyUpdate, getUpdateStatus } from "./api";
import type { UpdateStatus } from "./types";
import type { UpdateActionKind, UpdateProgress } from "./update-progress";

const reviewedActionKindKey = "hqb_update_action_kind";
const reviewedVersionKey = "hqb_update_expected_version";

export function UpdateSettings({
  initialStatus,
  progress,
  onStatusChange,
  onUpdateStarted
}: {
  initialStatus: UpdateStatus | null;
  progress: UpdateProgress | null;
  onStatusChange: (status: UpdateStatus) => void;
  onUpdateStarted: (buildId: string, kind: UpdateActionKind) => void;
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

    const expectedVersion = window.sessionStorage.getItem(reviewedVersionKey);
    const reviewedActionKind = window.sessionStorage.getItem(reviewedActionKindKey);
    window.sessionStorage.removeItem(reviewedVersionKey);
    window.sessionStorage.removeItem(reviewedActionKindKey);

    if (oauthResult !== "connected") {
      setApplyError(oauthErrorMessage(oauthResult));
      return;
    }
    if (!expectedVersion) {
      setApplyError("The reviewed release is no longer available. Check for updates again.");
      return;
    }

    const actionKind: UpdateActionKind = reviewedActionKind === "repair" ? "repair" : "update";
    setPendingAction("apply");
    void applyUpdate(expectedVersion)
      .then((result) => onUpdateStarted(result.buildId, actionKind))
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
  const repairOnly =
    status?.repairRequired === true && status.release.version === status.installedVersion;
  const repairInProgress = progress?.kind === "repair";

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
              <h3 className="text-sm font-medium">
                {repairInProgress ? "Installation repair in progress" : "Update in progress"}
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {repairInProgress
                  ? status?.release.version
                    ? `HQBase ${status.release.version} is completing its signed installation. `
                    : "HQBase is completing its signed installation. "
                  : status?.release.version
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
          <Version
            label={repairOnly ? "Installation" : "Available"}
            value={repairOnly ? "Repair required" : (status?.release.version ?? "Not checked")}
          />
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
          {repairOnly ? (
            <Alert>
              <AlertTitle>Finish installation repair</AlertTitle>
              <AlertDescription>
                This installation runs HQBase {status.release.version}, but its older build
                bootstrap did not finish the signed database migration phase. HQBase will replace
                that bootstrap and complete the same release from a fresh recovery checkpoint. It
                will not change your source repository.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-xl border border-border/80 bg-muted/25 p-4">
              <h3 className="text-sm font-medium">What’s changing</h3>
              {status.release.notes.length > 0 ? (
                <ul className="mt-2 space-y-2 pl-4 text-xs leading-5 text-muted-foreground">
                  {status.release.notes.map((note) => (
                    <li className="list-disc pl-1" key={note}>
                      {note}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  This older release record does not include an embedded changelog.
                </p>
              )}
              <a
                className="mt-3 inline-flex text-xs font-medium text-foreground underline-offset-4 hover:underline"
                href={status.release.notesUrl}
                rel="noreferrer"
                target="_blank"
              >
                Read complete release notes
              </a>
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium">
              {repairOnly ? "Complete repair" : "Apply update"}
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              HQBase verifies the signed artifact, records the Worker version and a new D1 bookmark,
              completes the migrations, and verifies the result before reporting success.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {!status.compatible ? (
              <Alert variant="destructive">
                <AlertTitle>
                  {repairOnly ? "Repair unavailable" : "Direct update unavailable"}
                </AlertTitle>
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
                {repairOnly ? "Finish repair" : "Install update"}
              </Button>
            ) : (
              <Button
                className="self-start"
                onClick={() => setAuthorizationOpen(true)}
                type="button"
              >
                {repairOnly ? "Finish repair" : "Install update"}
              </Button>
            )}
          </div>
        </div>
      ) : null}
      <CloudflareAuthorizationDialog
        authorizeHref="/api/updates/cloudflare/oauth/start"
        description={
          repairOnly
            ? "To finish this installation repair, HQBase needs temporary access to your Cloudflare account. You’ll return to Updates automatically, and HQBase will start the signed repair."
            : "To install this update, HQBase needs temporary access to your Cloudflare account. You’ll return to Updates automatically, and HQBase will start the update."
        }
        open={authorizationOpen}
        onAuthorize={() => {
          if (status?.release.version) {
            window.sessionStorage.setItem(reviewedVersionKey, status.release.version);
            window.sessionStorage.setItem(reviewedActionKindKey, repairOnly ? "repair" : "update");
          }
        }}
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

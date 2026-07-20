import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CloudflareAuthorizationDialog } from "@/features/settings/cloudflare-authorization-dialog";
import { SettingsSection } from "@/features/settings/settings-section";
import { applyUpdate, getUpdateStatus } from "./api";
import type { UpdateStatus } from "./types";

export function UpdateSettings({
  initialStatus
}: {
  initialStatus: UpdateStatus | null;
}): React.ReactElement {
  const [status, setStatus] = React.useState(initialStatus);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [buildId, setBuildId] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<"check" | "apply" | null>(null);
  const [authorizationOpen, setAuthorizationOpen] = React.useState(false);
  const resumedRef = React.useRef(false);

  React.useEffect(() => {
    if (resumedRef.current) return;
    const url = new URL(window.location.href);
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
      .then((result) => setBuildId(result.buildId))
      .catch((nextError: unknown) => {
        setApplyError(nextError instanceof Error ? nextError.message : "Update could not start.");
      })
      .finally(() => setPendingAction(null));
  }, []);

  async function check(): Promise<void> {
    setPendingAction("check");
    setCheckError(null);
    try {
      setStatus(await getUpdateStatus());
    } catch (nextError) {
      setCheckError(nextError instanceof Error ? nextError.message : "Update check failed.");
    } finally {
      setPendingAction(null);
    }
  }
  const isPending = pendingAction !== null;
  const statusLabel = !status
    ? "Not checked"
    : status.available
      ? "Update available"
      : "Up to date";

  return (
    <SettingsSection
      action={
        <Badge
          role="status"
          variant={!status ? "outline" : status.available ? "default" : "secondary"}
        >
          {statusLabel}
        </Badge>
      }
      description="Signed stable releases for this installation"
      title="Updates"
    >
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
      {buildId ? (
        <Alert>
          <AlertTitle>Update started</AlertTitle>
          <AlertDescription>
            Cloudflare build <span className="font-mono">{buildId}</span> is running. HQBase remains
            available during the build and will reconnect after deployment.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Version label="Installed" value={status?.installedVersion ?? "Unknown"} />
          <Version label="Latest stable" value={status?.release.version ?? "Not checked"} />
        </div>
        {status?.available ? (
          <div className="rounded-md border bg-background/50 p-4">
            <p className="font-medium">HQBase {status.release.version}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Schema {status.release.schemaVersion} · published{" "}
              {new Date(status.release.publishedAt).toLocaleDateString()}
            </p>
            <a
              className="mt-2 inline-block text-xs underline underline-offset-4"
              href={status.release.notesUrl}
              rel="noreferrer"
              target="_blank"
            >
              Read release notes
            </a>
          </div>
        ) : null}
        <Button
          className="self-start"
          disabled={isPending}
          onClick={() => void check()}
          type="button"
          variant="outline"
        >
          {pendingAction === "check" ? "Checking for updates…" : "Check again"}
        </Button>
      </div>
      {status?.available ? (
        <div className="flex flex-col gap-4">
          <Separator />
          <div>
            <h3 className="text-sm font-medium">Apply update</h3>
            <p className="mt-1 text-xs text-muted-foreground">
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
          <CloudflareAuthorizationDialog
            authorizeHref="/api/updates/cloudflare/oauth/start"
            description="To install this update, HQBase needs temporary access to your Cloudflare account. You’ll return to Updates automatically, and HQBase will start the update."
            open={authorizationOpen}
            onOpenChange={setAuthorizationOpen}
          />
        </div>
      ) : null}
    </SettingsSection>
  );
}

function oauthErrorMessage(result: string): string {
  if (result === "denied") return "Cloudflare authorization was cancelled.";
  if (result === "invalid") return "Cloudflare authorization expired. Please try again.";
  return "Cloudflare could not authorize the update. If your organization blocks HQBase, ask a Cloudflare administrator to allow the OAuth application.";
}

function Version({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background/50 p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLabelRow
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyUpdate, getUpdateStatus } from "./api";
import type { UpdateStatus } from "./types";

export function UpdateSettings({
  initialStatus
}: {
  initialStatus: UpdateStatus | null;
}): React.ReactElement {
  const [status, setStatus] = React.useState(initialStatus);
  const [apiToken, setApiToken] = React.useState("");
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [buildId, setBuildId] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<"check" | "apply" | null>(null);
  const tokenDescriptionId = "update-cloudflare-token-description";
  const tokenErrorId = "update-cloudflare-token-error";

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
  async function apply(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPendingAction("apply");
    setApplyError(null);
    try {
      const result = await applyUpdate(apiToken);
      setBuildId(result.buildId);
      setApiToken("");
    } catch (nextError) {
      setApplyError(nextError instanceof Error ? nextError.message : "Update could not start.");
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
    <div className="grid gap-5">
      {checkError ? (
        <Alert variant="destructive">
          <AlertTitle>Update check unavailable</AlertTitle>
          <AlertDescription>{checkError}</AlertDescription>
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
      <Card className="bg-card/70 shadow-none">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-medium">Updates</CardTitle>
              <CardDescription className="text-xs">
                Signed stable releases for this installation
              </CardDescription>
            </div>
            <Badge
              role="status"
              variant={!status ? "outline" : status.available ? "default" : "secondary"}
            >
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
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
          <Button disabled={isPending} onClick={() => void check()} type="button" variant="outline">
            {pendingAction === "check" ? "Checking for updates…" : "Check again"}
          </Button>
        </CardContent>
      </Card>
      {status?.available ? (
        <Card className="bg-card/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-medium">Apply update</CardTitle>
            <CardDescription className="text-xs">
              HQBase verifies the artifact, records the Worker version and D1 bookmark, migrates,
              deploys, and verifies before reporting success.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(event) => void apply(event)}>
              <Field data-invalid={Boolean(applyError)}>
                <FieldLabelRow>
                  <FieldLabel htmlFor="update-cloudflare-token">
                    Temporary Cloudflare API token
                  </FieldLabel>
                  {applyError ? <FieldError id={tokenErrorId}>{applyError}</FieldError> : null}
                </FieldLabelRow>
                <Input
                  aria-describedby={`${tokenDescriptionId}${applyError ? ` ${tokenErrorId}` : ""}`}
                  aria-invalid={Boolean(applyError)}
                  autoCapitalize="none"
                  autoComplete="off"
                  id="update-cloudflare-token"
                  minLength={20}
                  required
                  type="password"
                  value={apiToken}
                  onChange={(event) => {
                    setApiToken(event.target.value);
                    setApplyError(null);
                  }}
                />
                <FieldDescription id={tokenDescriptionId}>
                  Required permissions: Workers Scripts Read, Workers Builds Configuration Edit, and
                  Zone Read. The token is used for this request and is never stored.
                </FieldDescription>
              </Field>
              {!status.compatible ? (
                <Alert variant="destructive">
                  <AlertTitle>Direct update unavailable</AlertTitle>
                  <AlertDescription>
                    This release cannot update directly from the installed version.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button
                disabled={isPending || apiToken.length < 20 || !status.compatible}
                type="submit"
              >
                {pendingAction === "apply" ? "Starting update…" : "Start update"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Version({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background/50 p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

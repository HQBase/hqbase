import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [error, setError] = React.useState<string | null>(null);
  const [buildId, setBuildId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function check(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setStatus(await getUpdateStatus());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Update check failed.");
    } finally {
      setBusy(false);
    }
  }
  async function apply(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await applyUpdate(apiToken);
      setBuildId(result.buildId);
      setApiToken("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Update could not start.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Update unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {buildId ? (
        <Alert>
          <AlertTitle>Update started</AlertTitle>
          <AlertDescription>
            Cloudflare build {buildId} is running. HQBase remains available during the build and
            will reconnect after deployment.
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
            <Badge variant={status?.available ? "default" : "secondary"}>
              {status?.available ? "Update available" : "Up to date"}
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
          <Button disabled={busy} onClick={() => void check()} type="button" variant="outline">
            {busy ? "Checking…" : "Check again"}
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
          <CardContent className="grid gap-3">
            <Input
              autoComplete="off"
              onChange={(event) => setApiToken(event.target.value)}
              placeholder="Temporary Cloudflare API token"
              type="password"
              value={apiToken}
            />
            <p className="text-xs text-muted-foreground">
              Required permissions: Workers Scripts Read, Workers Builds Configuration Edit, and
              Zone Read. The token is used for this request and is never stored.
            </p>
            <Button
              disabled={busy || !apiToken || !status.compatible}
              onClick={() => void apply()}
              type="button"
            >
              Start update
            </Button>
            {!status.compatible ? (
              <p className="text-xs text-destructive">
                This release cannot update directly from the installed version.
              </p>
            ) : null}
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

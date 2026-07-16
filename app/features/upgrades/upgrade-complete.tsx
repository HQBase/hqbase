import { CheckCircle2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { apiPost } from "@/lib/api-client";

export function UpgradeComplete({
  onAddDomain,
  onOpenSettings
}: {
  onAddDomain: () => void;
  onOpenSettings: () => void;
}): React.ReactElement | null {
  const query = new URLSearchParams(window.location.search).get("upgrade");
  const visible = query === "complete" || query === "progress";
  const [state, setState] = React.useState<"finishing" | "complete" | "error">("finishing");

  React.useEffect(() => {
    if (!visible) return;
    void apiPost<{ state: string }>("/api/upgrades/pro/complete")
      .then(() => setState("complete"))
      .catch(() => setState("error"));
  }, [visible]);

  if (!visible) return null;
  return (
    <main className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4">
      <Card className="w-full max-w-xl shadow-sm">
        <CardHeader className="gap-3">
          <CheckCircle2 className="size-8 text-emerald-600" />
          <CardTitle>
            {state === "complete"
              ? "Your workspace is now running HQBase Pro."
              : "Finishing your HQBase Pro upgrade"}
          </CardTitle>
          {state === "complete" ? (
            <CardDescription className="leading-6">
              Your users, mail, domains, and Cloudflare resources were preserved.
              <br />
              You can now configure additional domains and other Pro features.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {state === "finishing"
            ? "Completing final verification and revoking temporary access…"
            : null}
          {state === "error"
            ? "Final verification needs attention. Your Pro Worker remains active; retry this screen."
            : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button disabled={state !== "complete"} type="button" onClick={onOpenSettings}>
            Open Pro settings
          </Button>
          <Button
            disabled={state !== "complete"}
            type="button"
            variant="outline"
            onClick={onAddDomain}
          >
            Add another domain
          </Button>
          {state === "error" ? (
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Retry verification
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </main>
  );
}

import { Cloud, Loader2, ShieldCheck } from "lucide-react";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WizardPanel } from "./setup-wizard-parts";

export function AccessStep({
  error,
  isLoading,
  onNext
}: {
  error: string | null;
  isLoading: boolean;
  onNext: () => void;
}): React.ReactElement {
  return (
    <WizardPanel
      actions={null}
      description="Checking the purchase-bound license, deployed Worker, and temporary Cloudflare grant."
      title="Verifying installation"
    >
      <Alert>
        <ShieldCheck />
        <AlertTitle>Temporary delegated access</AlertTitle>
        <AlertDescription>
          HQBase is verifying the access approved during installation. It will revoke the grant
          after domain and email setup is complete.
        </AlertDescription>
      </Alert>
      <div className="flex items-center gap-3 rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-foreground" />
        ) : (
          <Cloud className="size-5 text-foreground" />
        )}
        {isLoading ? "Checking Cloudflare resources…" : "Installation access is ready."}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Installation access needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button className="mt-3" size="sm" type="button" variant="outline" onClick={onNext}>
            Retry verification
          </Button>
        </Alert>
      ) : null}
    </WizardPanel>
  );
}

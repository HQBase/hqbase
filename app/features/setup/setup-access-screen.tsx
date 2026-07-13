import { Cloud, ShieldCheck } from "lucide-react";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WizardActions, WizardPanel } from "./setup-wizard-parts";

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
      actions={
        <WizardActions
          isLoading={isLoading}
          nextLabel="Continue with Cloudflare"
          onBack={null}
          onNext={onNext}
        />
      }
      description="Use the Cloudflare access you approved during installation. There is no API token to paste."
      eyebrow="Cloudflare"
      title="Cloudflare is authorized"
    >
      <Alert>
        <ShieldCheck />
        <AlertTitle>Temporary delegated access</AlertTitle>
        <AlertDescription>
          HQBase will list the accounts and domains you selected, configure email, and then revoke
          the grant after setup is complete.
        </AlertDescription>
      </Alert>
      <div className="flex items-center gap-3 rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
        <Cloud className="size-5 text-foreground" />
        Cloudflare will show an error here if the installation grant expired or lacks a permission.
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </WizardPanel>
  );
}

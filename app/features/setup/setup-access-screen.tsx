import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

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
    <div className="flex flex-col gap-4">
      {isLoading || !error ? (
        <div
          className="flex items-center gap-2.5 py-1 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <Spinner className="text-foreground" />
          <span>Checking Cloudflare access to set up the workspace…</span>
        </div>
      ) : null}
      {error ? (
        <div className="flex flex-col items-start gap-2 py-1" role="alert">
          <p className="text-sm leading-6 text-muted-foreground">{error}</p>
          <Button className="mt-1" size="sm" type="button" variant="outline" onClick={onNext}>
            Authorize Cloudflare
          </Button>
        </div>
      ) : null}
    </div>
  );
}

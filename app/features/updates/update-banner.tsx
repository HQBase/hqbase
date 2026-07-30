import { ArrowUpCircle } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { UpdateStatus } from "./types";

export function UpdateBanner({
  inProgress,
  ready,
  status,
  onOpen
}: {
  inProgress: boolean;
  ready: boolean;
  status: UpdateStatus | null;
  onOpen: () => void;
}): React.ReactElement | null {
  if (ready || (!inProgress && !status?.available)) return null;
  const targetVersion = status?.release.version;
  return (
    <div
      aria-live="polite"
      className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b bg-muted/45 px-3 text-xs md:px-4"
      role="status"
    >
      <div className="flex items-center gap-2">
        {inProgress ? (
          <Spinner
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
            role="presentation"
          />
        ) : (
          <ArrowUpCircle aria-hidden="true" className="size-4 text-muted-foreground" />
        )}
        <span>
          <strong>{inProgress ? "Update in progress" : "Update available"}</strong>
          {targetVersion ? ` · HQBase ${targetVersion}` : null}
        </span>
      </div>
      <Button className="h-7 px-3 text-xs" onClick={onOpen} type="button" variant="outline">
        {inProgress ? "View progress" : "Review update"}
      </Button>
    </div>
  );
}

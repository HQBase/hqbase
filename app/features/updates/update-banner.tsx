import { ArrowUpCircle } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "./types";

export function UpdateBanner({
  inProgress,
  status,
  onOpen
}: {
  inProgress: boolean;
  status: UpdateStatus | null;
  onOpen: () => void;
}): React.ReactElement | null {
  if (inProgress || !status?.available) return null;
  return (
    <div
      aria-live="polite"
      className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b bg-muted/45 px-3 text-xs md:px-4"
      role="status"
    >
      <div className="flex items-center gap-2">
        <ArrowUpCircle aria-hidden="true" className="size-4 text-muted-foreground" />
        <span>
          <strong>Update available</strong> · HQBase {status.release.version}
        </span>
      </div>
      <Button className="h-7 px-3 text-xs" onClick={onOpen} type="button" variant="outline">
        Review update
      </Button>
    </div>
  );
}

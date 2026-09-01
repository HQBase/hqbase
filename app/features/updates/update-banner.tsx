import type * as React from "react";
import { PiArrowCircleUp } from "react-icons/pi";
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
  const repairOnly =
    status?.repairRequired === true && status.release.version === status.installedVersion;
  if ((ready && !repairOnly) || (!inProgress && !status?.available)) return null;
  const targetVersion = status?.release.version;
  const firstNote = repairOnly
    ? "Complete the signed database migration phase omitted by the older build bootstrap."
    : status?.release.notes[0];
  const title = inProgress
    ? repairOnly
      ? "Installation repair in progress"
      : "Update in progress"
    : repairOnly
      ? "Installation repair available"
      : "Update available";
  return (
    <div
      aria-live="polite"
      className="flex min-h-10 shrink-0 px-4 py-2 items-center justify-between gap-3 border-b bg-muted/45 px-3 text-xs md:px-8"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2">
        {inProgress ? (
          <Spinner
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
            role="presentation"
          />
        ) : (
          <PiArrowCircleUp aria-hidden="true" className="size-4 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p>
            <strong>{title}</strong>
            {targetVersion ? ` · HQBase ${targetVersion}` : null}
          </p>
          {!inProgress && firstNote ? (
            <p className="truncate text-muted-foreground">{firstNote}</p>
          ) : null}
        </div>
      </div>
      <Button className="h-7 px-3 text-xs" onClick={onOpen} type="button" variant="outline">
        {inProgress ? "View progress" : repairOnly ? "View repair" : "View changelog"}
      </Button>
    </div>
  );
}

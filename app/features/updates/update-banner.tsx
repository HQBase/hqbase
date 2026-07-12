import { ArrowUpCircle } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "./types";

export function UpdateBanner({
  status,
  onOpen
}: {
  status: UpdateStatus | null;
  onOpen: () => void;
}): React.ReactElement | null {
  if (!status?.available) return null;
  return (
    <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-blue-500/25 bg-blue-500/10 px-3 text-xs md:px-4">
      <div className="flex items-center gap-2">
        <ArrowUpCircle className="size-4 text-blue-600" />
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

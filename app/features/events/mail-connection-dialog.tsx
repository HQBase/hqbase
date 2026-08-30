import * as React from "react";
import { PiWifiSlash } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { MailConnectionStatus } from "./types";

export function MailConnectionDialog({
  status
}: {
  status: MailConnectionStatus;
}): React.ReactElement {
  const unavailable = status === "unavailable";
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!unavailable) setDismissed(false);
  }, [unavailable]);

  return (
    <Dialog
      open={unavailable && !dismissed}
      onOpenChange={(open) => {
        if (!open) setDismissed(true);
      }}
    >
      <DialogContent className="w-[min(92vw,440px)]" role="alertdialog">
        <div className="flex items-start gap-3 pr-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <PiWifiSlash aria-hidden="true" className="size-5" />
          </span>
          <DialogHeader>
            <DialogTitle>Connection lost</DialogTitle>
            <DialogDescription>
              HQBase cannot reach your mail right now. Check your internet connection. HQBase will
              reconnect and refresh your mail automatically when the connection returns.
            </DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Dismiss</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

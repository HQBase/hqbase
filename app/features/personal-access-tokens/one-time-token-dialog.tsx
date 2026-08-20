import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

export function OneTimeTokenDialog({
  open,
  token,
  onCopy,
  onOpenChange
}: {
  open: boolean;
  token: string | null;
  onCopy: () => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  return (
    <Dialog open={open && token !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,560px)]">
        <DialogHeader>
          <DialogTitle>Personal access token created</DialogTitle>
          <DialogDescription>Copy this token now. HQBase cannot show it again.</DialogDescription>
        </DialogHeader>
        <code className="block overflow-x-auto rounded-lg border bg-muted/40 p-3 text-sm">
          {token}
        </code>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button
            type="button"
            onClick={() => {
              void onCopy().then(setCopied);
            }}
          >
            {copied ? "Copied" : "Copy token"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import type * as React from "react";
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

export function CloudflareAuthorizationDialog({
  authorizeHref,
  description,
  onAuthorize,
  onOpenChange,
  open
}: {
  authorizeHref: string;
  description: string;
  onAuthorize?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,520px)]">
        <CloudflareAuthorizationDialogBody
          authorizeHref={authorizeHref}
          description={description}
          {...(onAuthorize ? { onAuthorize } : {})}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CloudflareAuthorizationDialogBody({
  authorizeHref,
  description,
  onAuthorize
}: {
  authorizeHref: string;
  description: string;
  onAuthorize?: () => void;
}): React.ReactElement {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Authorize Cloudflare</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button asChild>
          <a href={authorizeHref} onClick={onAuthorize}>
            Authorize Cloudflare
          </a>
        </Button>
      </DialogFooter>
    </>
  );
}

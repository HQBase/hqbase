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
import { RecentAuthenticationGate } from "@/features/auth/recent-authentication";

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
        <CloudflareAuthorizationFlow
          active={open}
          authorizeHref={authorizeHref}
          description={description}
          layout="dialog"
          {...(onAuthorize ? { onAuthorize } : {})}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CloudflareAuthorizationFlow({
  active,
  authorizeHref,
  description,
  layout,
  onAuthorize
}: {
  active: boolean;
  authorizeHref: string;
  description: string;
  layout: "dialog" | "inline";
  onAuthorize?: () => void;
}): React.ReactElement {
  return (
    <RecentAuthenticationGate
      active={active}
      description={description}
      layout={layout}
      ready={
        layout === "dialog" ? (
          <CloudflareAuthorizationDialogBody
            authorizeHref={authorizeHref}
            description={description}
            {...(onAuthorize ? { onAuthorize } : {})}
          />
        ) : (
          <InlineAuthorization
            authorizeHref={authorizeHref}
            description={description}
            {...(onAuthorize ? { onAuthorize } : {})}
          />
        )
      }
      onAuthenticated={() => {
        onAuthorize?.();
        window.location.assign(authorizeHref);
      }}
    />
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

function InlineAuthorization({
  authorizeHref,
  description,
  onAuthorize
}: {
  authorizeHref: string;
  description: string;
  onAuthorize?: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      <Button asChild className="self-start">
        <a href={authorizeHref} onClick={onAuthorize}>
          Authorize Cloudflare
        </a>
      </Button>
    </div>
  );
}

import { Cable } from "lucide-react";
import * as React from "react";

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
import { Input } from "@/components/ui/input";
import type { CurrentUser } from "@/features/auth/types";

type McpConnectionDialogProps = {
  open: boolean;
  restoreFocusRef: React.RefObject<HTMLButtonElement | null>;
  user: CurrentUser;
  onOpenChange: (open: boolean) => void;
};

export function McpConnectionDialog({
  open,
  restoreFocusRef,
  user,
  onOpenChange
}: McpConnectionDialogProps): React.ReactElement {
  const [endpoint, setEndpoint] = React.useState("/mcp");
  const endpointId = React.useId();

  React.useEffect(() => {
    setEndpoint(new URL("/mcp", window.location.origin).toString());
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(92vw,560px)]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground">
              <Cable aria-hidden="true" className="size-4" />
            </span>
            <DialogTitle>Connect MCP</DialogTitle>
          </div>
          <DialogDescription>
            Connect this workspace to a remote MCP client without creating another HQBase identity.
          </DialogDescription>
        </DialogHeader>

        <McpConnectionDetails endpoint={endpoint} endpointId={endpointId} user={user} />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function McpConnectionDetails({
  endpoint,
  endpointId,
  user
}: {
  endpoint: string;
  endpointId: string;
  user: CurrentUser;
}): React.ReactElement {
  return (
    <div className="space-y-4 text-sm">
      <section className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-medium text-muted-foreground">Signed-in user</p>
        <p className="mt-1 font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">
          {user.email} · {user.role}
        </p>
        <p className="mt-2 text-muted-foreground">
          The MCP client connects as this user after sign-in and consent.
        </p>
      </section>

      <div className="space-y-2">
        <label className="text-xs font-medium" htmlFor={endpointId}>
          Streamable HTTP endpoint
        </label>
        <Input
          className="font-mono text-xs"
          id={endpointId}
          readOnly
          value={endpoint}
          onFocus={(event) => event.currentTarget.select()}
        />
        <p className="text-xs text-muted-foreground">
          Add this URL to a client that supports remote Streamable HTTP MCP.
        </p>
      </div>

      <section className="space-y-2 rounded-lg border p-3 text-muted-foreground">
        <p className="font-medium text-foreground">What happens next</p>
        <p>
          The client discovers HQBase OAuth 2.1, registers dynamically with PKCE, and opens HQBase
          for sign-in and explicit consent. No API token or Cloudflare credential is required.
        </p>
        <p>
          OAuth scopes never widen access. HQBase continues to apply this user&apos;s current
          workspace role and live mailbox grants.
        </p>
      </section>
    </div>
  );
}

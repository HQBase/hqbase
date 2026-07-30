import { Cable, Check, Copy, Send, ShieldCheck } from "lucide-react";
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
  const [readOnlyEndpoint, setReadOnlyEndpoint] = React.useState("/mcp");
  const [fullEndpoint, setFullEndpoint] = React.useState("/mcp/full");
  const readOnlyEndpointId = React.useId();
  const fullEndpointId = React.useId();

  React.useEffect(() => {
    setReadOnlyEndpoint(new URL("/mcp", window.location.origin).toString());
    setFullEndpoint(new URL("/mcp/full", window.location.origin).toString());
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

        <McpConnectionDetails
          fullEndpoint={fullEndpoint}
          fullEndpointId={fullEndpointId}
          readOnlyEndpoint={readOnlyEndpoint}
          readOnlyEndpointId={readOnlyEndpointId}
          user={user}
        />

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
  fullEndpoint,
  fullEndpointId,
  readOnlyEndpoint,
  readOnlyEndpointId,
  user
}: {
  fullEndpoint: string;
  fullEndpointId: string;
  readOnlyEndpoint: string;
  readOnlyEndpointId: string;
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

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Connection profile</p>
          <p className="mt-1 text-muted-foreground">
            Choose the permission level supported by your MCP client.
          </p>
        </div>

        <McpEndpointOption
          description="Search and read allowed mail without changing it."
          endpoint={readOnlyEndpoint}
          endpointId={readOnlyEndpointId}
          icon={<ShieldCheck aria-hidden="true" className="size-4" />}
          permissions="Mailboxes, conversations, messages, threads, and attachments"
          title="Read only"
        />
        <McpEndpointOption
          description="Read mail, manage its state, work with drafts, and send."
          endpoint={fullEndpoint}
          endpointId={fullEndpointId}
          icon={<Send aria-hidden="true" className="size-4" />}
          permissions="Archive and trash actions, drafts, send, reply, and forward"
          title="Read, manage & send"
        />
      </div>

      <section className="space-y-2 rounded-lg border p-3 text-muted-foreground">
        <p className="font-medium text-foreground">What happens next</p>
        <p>
          The chosen endpoint tells the client which scopes to request. The client discovers HQBase
          OAuth 2.1, registers dynamically with PKCE, and opens HQBase for sign-in and explicit
          consent.
        </p>
        <p>
          No API token or Cloudflare credential is required. OAuth scopes never widen access; HQBase
          continues to apply this user&apos;s current workspace role and live mailbox grants.
        </p>
      </section>
    </div>
  );
}

function McpEndpointOption({
  description,
  endpoint,
  endpointId,
  icon,
  permissions,
  title
}: {
  description: string;
  endpoint: string;
  endpointId: string;
  icon: React.ReactNode;
  permissions: string;
  title: string;
}): React.ReactElement {
  const [copied, setCopied] = React.useState(false);

  async function copyEndpoint(): Promise<void> {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <p className="border-l-2 border-border pl-2 text-xs text-muted-foreground">{permissions}</p>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={endpointId}>
          {title} Streamable HTTP endpoint
        </label>
        <Input
          className="min-w-0 font-mono text-xs"
          id={endpointId}
          readOnly
          value={endpoint}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          aria-label={`Copy ${title} endpoint`}
          onClick={() => void copyEndpoint()}
          size="sm"
          type="button"
          variant="outline"
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </section>
  );
}

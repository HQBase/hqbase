import { Cable, Check, Copy, Send, ShieldCheck } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        className="top-[calc(env(safe-area-inset-top)+(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))/2)] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)] w-[min(92vw,560px)] gap-3 overflow-y-auto overscroll-contain p-4 sm:top-1/2 sm:max-h-[calc(100dvh-2rem)] sm:gap-4 sm:p-5"
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
            Choose a permission profile, then copy its Streamable HTTP endpoint.
          </DialogDescription>
        </DialogHeader>

        <McpConnectionDetails
          fullEndpoint={fullEndpoint}
          fullEndpointId={fullEndpointId}
          readOnlyEndpoint={readOnlyEndpoint}
          readOnlyEndpointId={readOnlyEndpointId}
          user={user}
        />
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
    <div className="flex flex-col gap-3 text-sm">
      <section className="rounded-lg border bg-muted/30 px-3 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">Connecting as</p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground">
            {user.email} · {user.role}
          </p>
        </div>
        <p className="mt-1 text-xs leading-4 text-muted-foreground">
          After consent, HQBase rechecks this user&apos;s current workspace role and live mailbox
          grants.
        </p>
      </section>

      <Tabs defaultValue="read-only">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Server profile</p>
          <TabsList
            aria-label="Server profile"
            className="grid h-9 w-full grid-cols-2 rounded-full"
          >
            <TabsTrigger className="rounded-full px-2 text-xs" value="read-only">
              Read only
            </TabsTrigger>
            <TabsTrigger className="rounded-full px-2 text-xs" value="mail-actions">
              Mail actions
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="mt-2" value="read-only">
          <McpEndpointOption
            description="Search and read allowed mail without changing it."
            endpoint={readOnlyEndpoint}
            endpointId={readOnlyEndpointId}
            icon={<ShieldCheck aria-hidden="true" className="size-4" />}
            permissions="Mailboxes, conversations, messages, threads, and attachments"
            title="Read only"
          />
        </TabsContent>
        <TabsContent className="mt-2" value="mail-actions">
          <McpEndpointOption
            description="Read mail, manage its state, work with drafts, and send."
            endpoint={fullEndpoint}
            endpointId={fullEndpointId}
            icon={<Send aria-hidden="true" className="size-4" />}
            permissions="Archive and trash actions, drafts, send, reply, and forward"
            title="Read, manage & send"
          />
        </TabsContent>
      </Tabs>

      <section className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-xs leading-4 text-muted-foreground">
        <p className="font-medium text-foreground">What happens next</p>
        <p>
          The client discovers HQBase OAuth 2.1, registers dynamically with PKCE, then opens sign-in
          and consent. No API token or Cloudflare credential is required.
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
    <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Includes:</span> {permissions}
      </p>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={endpointId}>
          {title} Streamable HTTP endpoint
        </label>
        <Input
          className="min-w-0 font-mono text-base sm:text-xs"
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
          {copied ? (
            <Check aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Copy aria-hidden="true" data-icon="inline-start" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </section>
  );
}

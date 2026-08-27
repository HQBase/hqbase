import * as React from "react";
import { PiCheck, PiCopy, PiPaperPlaneTilt, PiShieldCheck, PiUser } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CurrentUser } from "@/features/auth/types";

export function McpConnectionDetails({
  fullEndpoint,
  fullEndpointId,
  readOnlyEndpoint,
  readOnlyEndpointId,
  showIdentity = true,
  user
}: {
  fullEndpoint: string;
  fullEndpointId: string;
  readOnlyEndpoint: string;
  readOnlyEndpointId: string;
  showIdentity?: boolean;
  user: CurrentUser;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-5 text-sm">
      {showIdentity ? (
        <section className="rounded-xl border bg-muted/30 p-3.5">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs">
              <PiUser aria-hidden="true" className="size-4.5" data-icon="connection-identity" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Connecting as</p>
              <p className="mt-0.5 font-semibold text-foreground">{user.name}</p>
              <p className="break-all text-xs text-muted-foreground">
                {user.email} · {user.role}
              </p>
              <p className="mt-2 text-xs leading-4 text-muted-foreground">
                After consent, HQBase rechecks this user&apos;s current workspace role and live
                mailbox grants.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <Tabs defaultValue="mail-actions">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Server profile</p>
          <TabsList
            aria-label="Server profile"
            className="inline-flex h-8 w-fit gap-1 rounded-full p-1"
          >
            <TabsTrigger className="h-6 min-h-0 rounded-full px-3 text-xs" value="mail-actions">
              Mail actions
            </TabsTrigger>
            <TabsTrigger className="h-6 min-h-0 rounded-full px-3 text-xs" value="read-only">
              Read only
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="mt-4" value="read-only">
          <McpEndpointOption
            description="Search and read allowed mail without changing it."
            endpoint={readOnlyEndpoint}
            endpointId={readOnlyEndpointId}
            icon={<PiShieldCheck aria-hidden="true" className="pointer-events-none size-4" />}
            permissions="Mailboxes, conversations, messages, threads, and attachments"
            title="Read only"
          />
        </TabsContent>
        <TabsContent className="mt-4" value="mail-actions">
          <McpEndpointOption
            description="Read mail, manage its state, work with drafts, and send."
            endpoint={fullEndpoint}
            endpointId={fullEndpointId}
            icon={<PiPaperPlaneTilt aria-hidden="true" className="pointer-events-none size-4" />}
            permissions="Archive, unarchive, trash, and restore actions, drafts, send, reply, and forward"
            title="Read, manage & send"
          />
        </TabsContent>
      </Tabs>

      <section className="flex flex-col gap-1 text-xs leading-4 text-muted-foreground">
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
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="font-medium text-foreground">{title}</h3>
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
            <PiCheck aria-hidden="true" className="pointer-events-none" data-icon="inline-start" />
          ) : (
            <PiCopy aria-hidden="true" className="pointer-events-none" data-icon="inline-start" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </section>
  );
}

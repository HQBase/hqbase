import * as React from "react";
import { PiCheck, PiCopy, PiDownload, PiFileText } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CurrentUser } from "@/features/auth/types";
import { McpConnectionDetails } from "@/features/mcp/connection-dialog";

export function AgentConnectionDetails({
  fullEndpoint,
  fullEndpointId,
  skillUrl,
  skillUrlId,
  readOnlyEndpoint,
  readOnlyEndpointId,
  user
}: {
  fullEndpoint: string;
  fullEndpointId: string;
  skillUrl: string;
  skillUrlId: string;
  readOnlyEndpoint: string;
  readOnlyEndpointId: string;
  user: CurrentUser;
}): React.ReactElement {
  return (
    <>
      <ConnectionIdentity user={user} />

      <Tabs defaultValue="mcp">
        <TabsList
          aria-label="Connection method"
          className="grid h-9 w-full grid-cols-2 rounded-full"
        >
          <TabsTrigger className="h-7 min-h-0 rounded-full px-2 text-xs" value="mcp">
            MCP
          </TabsTrigger>
          <TabsTrigger className="h-7 min-h-0 rounded-full px-2 text-xs" value="agent-skill">
            Agent Skill
          </TabsTrigger>
        </TabsList>

        <TabsContent className="mt-3" value="mcp">
          <McpConnectionDetails
            fullEndpoint={fullEndpoint}
            fullEndpointId={fullEndpointId}
            readOnlyEndpoint={readOnlyEndpoint}
            readOnlyEndpointId={readOnlyEndpointId}
            showIdentity={false}
            user={user}
          />
        </TabsContent>
        <TabsContent className="mt-3" value="agent-skill">
          <AgentSkillDetails skillUrl={skillUrl} skillUrlId={skillUrlId} />
        </TabsContent>
      </Tabs>
    </>
  );
}

export function AgentSkillDetails({
  skillUrl,
  skillUrlId
}: {
  skillUrl: string;
  skillUrlId: string;
}): React.ReactElement {
  const [copied, setCopied] = React.useState(false);

  async function copyUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(skillUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
            <PiFileText aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground">Deployment-local Agent Skill</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Install the skill or give its URL to an agent that can make HTTP requests.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor={skillUrlId}>
            Agent Skill URL
          </label>
          <Input
            className="min-w-0 font-mono text-base sm:text-xs"
            id={skillUrlId}
            readOnly
            value={skillUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <Button
              aria-label="Copy Agent Skill URL"
              onClick={() => void copyUrl()}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? (
                <PiCheck aria-hidden="true" data-icon="inline-start" />
              ) : (
                <PiCopy aria-hidden="true" data-icon="inline-start" />
              )}
              {copied ? "Copied" : "Copy URL"}
            </Button>
            <Button asChild size="sm" variant="outline">
              <a download="SKILL.md" href={skillUrl}>
                <PiDownload aria-hidden="true" data-icon="inline-start" />
                Download Skill
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-xs leading-4 text-muted-foreground">
        <p className="font-medium text-foreground">What happens next</p>
        <p>
          The agent reads the API and safety instructions, then gives you a short code and a link to
          approve in your normal browser. This URL grants no access and contains no account or mail
          data.
        </p>
      </section>
    </div>
  );
}

function ConnectionIdentity({ user }: { user: CurrentUser }): React.ReactElement {
  return (
    <section className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
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
  );
}

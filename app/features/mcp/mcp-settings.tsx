import * as React from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentCreateDialog, type AgentDomainOption } from "@/features/agents/agent-create-dialog";
import {
  AgentCredentialDialog,
  type AgentCredentialReveal
} from "@/features/agents/agent-credential-dialog";
import {
  AgentConnectionDetails,
  AgentSkillDetails,
  ConnectionDivider
} from "@/features/agents/connection-dialog";
import type { AgentCredentialResult } from "@/features/agents/types";
import type { CurrentUser } from "@/features/auth/types";
import type { Mailbox } from "@/features/mailboxes/types";
import { SettingsSection } from "@/features/settings/settings-section";

type McpSettingsProps = {
  canManage: boolean;
  domains: AgentDomainOption[];
  mailboxes: Mailbox[];
  onChanged: () => Promise<void>;
  user: CurrentUser;
};

export function McpSettings({
  canManage,
  domains,
  mailboxes,
  onChanged,
  user
}: McpSettingsProps): React.ReactElement {
  const [readOnlyEndpoint, setReadOnlyEndpoint] = React.useState("/mcp");
  const [fullEndpoint, setFullEndpoint] = React.useState("/mcp/full");
  const [humanSkillUrl, setHumanSkillUrl] = React.useState("/skills/hqbase-mail/SKILL.md");
  const [mailboxSkillUrl, setMailboxSkillUrl] = React.useState("/skills/hqbase-mailbox/SKILL.md");
  const [provisionerSkillUrl, setProvisionerSkillUrl] = React.useState(
    "/skills/hqbase-provisioner/SKILL.md"
  );
  const readOnlyEndpointId = React.useId();
  const fullEndpointId = React.useId();
  const humanSkillUrlId = React.useId();
  const mailboxSkillUrlId = React.useId();
  const provisionerSkillUrlId = React.useId();
  const [credential, setCredential] = React.useState<AgentCredentialReveal | null>(null);

  React.useEffect(() => {
    setReadOnlyEndpoint(new URL("/mcp", window.location.origin).toString());
    setFullEndpoint(new URL("/mcp/full", window.location.origin).toString());
    setHumanSkillUrl(new URL("/skills/hqbase-mail/SKILL.md", window.location.origin).toString());
    setMailboxSkillUrl(
      new URL("/skills/hqbase-mailbox/SKILL.md", window.location.origin).toString()
    );
    setProvisionerSkillUrl(
      new URL("/skills/hqbase-provisioner/SKILL.md", window.location.origin).toString()
    );
  }, []);

  function revealCredential(result: AgentCredentialResult): void {
    setCredential({
      agentName: result.agent.name,
      agentProfile: result.agent.profile,
      credential: result.credential
    });
  }

  async function finishCredentialReveal(): Promise<void> {
    setCredential(null);
    try {
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workspace could not be refreshed.");
    }
  }

  return (
    <>
      <SettingsSection
        description="Choose whose mail the AI can use, then copy the matching connection."
        title="Connect AI agents"
      >
        <Tabs defaultValue="your-account">
          <TabsList
            aria-label="AI connection identity"
            className="grid h-9 w-full grid-cols-2 rounded-full"
          >
            <TabsTrigger className="h-7 min-h-0 rounded-full px-2 text-xs" value="your-account">
              Your account
            </TabsTrigger>
            <TabsTrigger className="h-7 min-h-0 rounded-full px-2 text-xs" value="agentic-mailbox">
              Agentic mailbox
            </TabsTrigger>
          </TabsList>

          <TabsContent className="mt-6" value="your-account">
            <AgentConnectionDetails
              fullEndpoint={fullEndpoint}
              fullEndpointId={fullEndpointId}
              readOnlyEndpoint={readOnlyEndpoint}
              readOnlyEndpointId={readOnlyEndpointId}
              skillUrl={humanSkillUrl}
              skillUrlId={humanSkillUrlId}
              user={user}
            />
          </TabsContent>
          <TabsContent className="mt-6" value="agentic-mailbox">
            <div className="flex flex-col gap-7">
              <AgentSkillDetails
                flat
                action={
                  canManage ? (
                    <AgentCreateDialog
                      domains={domains}
                      mailboxes={mailboxes}
                      profile="mailbox"
                      onCreated={revealCredential}
                    />
                  ) : undefined
                }
                description="Give an AI its own identity and access to one mailbox."
                nextStep="Create the agent, then give its one-time credential and this public skill to the service that will run it."
                skillUrl={mailboxSkillUrl}
                skillUrlId={mailboxSkillUrlId}
                title="Mailbox agent"
              />
              <ConnectionDivider label="Automate mailbox creation" />
              <AgentSkillDetails
                flat
                action={
                  canManage ? (
                    <AgentCreateDialog
                      domains={domains}
                      mailboxes={mailboxes}
                      profile="provisioner"
                      onCreated={revealCredential}
                    />
                  ) : undefined
                }
                description="Let a trusted service create and deprovision agent mailboxes."
                nextStep="Create the provisioner, then give its one-time credential and this public skill only to its trusted control-plane service."
                skillUrl={provisionerSkillUrl}
                skillUrlId={provisionerSkillUrlId}
                title="Provisioner agent"
              />
            </div>
          </TabsContent>
        </Tabs>
      </SettingsSection>
      <AgentCredentialDialog reveal={credential} onDone={() => void finishCredentialReveal()} />
    </>
  );
}

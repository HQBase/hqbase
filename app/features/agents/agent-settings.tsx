import * as React from "react";
import { PiArrowClockwise, PiDotsThree, PiPause } from "react-icons/pi";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { Mailbox } from "@/features/mailboxes/types";
import { SettingsSection } from "@/features/settings/settings-section";
import { AgentCreateDialog } from "./agent-create-dialog";
import { AgentCredentialDialog, type AgentCredentialReveal } from "./agent-credential-dialog";
import { listAgents, rotateAgentCredential, setAgentActive } from "./api";
import { AgentSkillDetails } from "./connection-dialog";
import type { AgentCredentialResult, AgentProfile, ManagedAgent } from "./types";

type DomainOption = { id: string; name: string; isEnabled: boolean };
type Confirmation = { action: "disable" | "rotate"; agent: ManagedAgent };
type PendingAction = { action: "disable" | "reactivate" | "rotate"; agentId: string };
type CredentialState = AgentCredentialReveal & { refreshWorkspace: boolean };

export function AgentSettings({
  domains,
  mailboxes,
  profile,
  onChanged
}: {
  domains: DomainOption[];
  mailboxes: Mailbox[];
  profile: AgentProfile;
  onChanged: () => Promise<void>;
}): React.ReactElement {
  const [agents, setAgents] = React.useState<ManagedAgent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null);
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [credential, setCredential] = React.useState<CredentialState | null>(null);
  const skillPath =
    profile === "mailbox"
      ? "/skills/hqbase-mailbox/SKILL.md"
      : "/skills/hqbase-provisioner/SKILL.md";
  const [skillUrl, setSkillUrl] = React.useState(skillPath);
  const skillUrlId = React.useId();

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setAgents((await listAgents()).filter((agent) => agent.profile === profile));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agents could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    setSkillUrl(new URL(skillPath, window.location.origin).toString());
  }, [skillPath]);

  function updateAgent(agent: ManagedAgent): void {
    setAgents((current) => {
      const withoutAgent = current.filter((item) => item.id !== agent.id);
      return [...withoutAgent, agent].sort((left, right) => left.name.localeCompare(right.name));
    });
  }

  function revealCredential(result: AgentCredentialResult, refreshWorkspace = false): void {
    setCredential({
      agentName: result.agent.name,
      agentProfile: result.agent.profile,
      credential: result.credential,
      refreshWorkspace
    });
  }

  function handleCreated(result: AgentCredentialResult): void {
    updateAgent(result.agent);
    revealCredential(result, true);
  }

  async function reactivate(agent: ManagedAgent): Promise<void> {
    setPending({ action: "reactivate", agentId: agent.id });
    try {
      const result = await setAgentActive(agent.id, true);
      updateAgent(result.agent);
      if (!result.credential) throw new Error("The new agent credential was not returned.");
      revealCredential({ agent: result.agent, credential: result.credential });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agent could not be reactivated.");
    } finally {
      setPending(null);
    }
  }

  async function confirmAction(): Promise<void> {
    if (!confirmation) return;
    const { action, agent } = confirmation;
    setPending({ action, agentId: agent.id });
    try {
      if (action === "rotate") {
        const result = await rotateAgentCredential(agent.id);
        updateAgent(result.agent);
        revealCredential(result);
      } else {
        const result = await setAgentActive(agent.id, false);
        updateAgent(result.agent);
        toast.success(
          agent.profile === "mailbox"
            ? "Agent disabled. Its mailbox remains active."
            : "Provisioning key disabled."
        );
      }
      setConfirmation(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agent could not be updated.");
    } finally {
      setPending(null);
    }
  }

  async function finishCredentialReveal(): Promise<void> {
    const refreshWorkspace = credential?.refreshWorkspace === true;
    setCredential(null);
    if (!refreshWorkspace) return;
    try {
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workspace could not be refreshed.");
    }
  }

  return (
    <>
      <SettingsSection
        action={
          <AgentCreateDialog
            domains={domains}
            mailboxes={mailboxes}
            profile={profile}
            onCreated={handleCreated}
          />
        }
        description={
          profile === "mailbox"
            ? "Give software its own identity and access to one exact mailbox."
            : "Let trusted control-plane software create and deprovision mailbox agents."
        }
        title={profile === "mailbox" ? "Mailbox agents" : "Provisioning keys"}
      >
        <div className="flex flex-col gap-6">
          <AgentSkillDetails
            flat
            description={
              profile === "mailbox"
                ? "Give this public skill to software that uses a mailbox-agent credential."
                : "Give this public skill only to trusted provisioning software."
            }
            nextStep="Create the identity, then give its one-time credential and this skill to the service that will run it."
            skillUrl={skillUrl}
            skillUrlId={skillUrlId}
            title={profile === "mailbox" ? "Mailbox agent skill" : "Provisioning skill"}
          />
          <AgentTable
            agents={agents}
            loading={loading}
            pending={pending}
            profile={profile}
            onConfirm={setConfirmation}
            onReactivate={(agent) => void reactivate(agent)}
          />
        </div>
      </SettingsSection>

      <AgentCredentialDialog reveal={credential} onDone={() => void finishCredentialReveal()} />

      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogContent className="w-[min(92vw,480px)]">
          <DialogHeader>
            <DialogTitle>
              {confirmation?.action === "rotate"
                ? "Rotate credential?"
                : confirmation?.agent.profile === "provisioner"
                  ? "Disable provisioning key?"
                  : "Disable mailbox agent?"}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.action === "rotate"
                ? "The current credential will stop working immediately."
                : confirmation?.agent.profile === "mailbox"
                  ? "The mailbox and address will keep receiving mail. Existing messages and audit history will remain."
                  : "This provisioning key will no longer be able to create mailboxes."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={pending !== null}
              type="button"
              variant={confirmation?.action === "disable" ? "destructive" : "default"}
              onClick={() => void confirmAction()}
            >
              {confirmation?.action === "rotate"
                ? "Rotate credential"
                : confirmation?.agent.profile === "provisioner"
                  ? "Disable key"
                  : "Disable agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AgentTable({
  agents,
  loading,
  pending,
  profile,
  onConfirm,
  onReactivate
}: {
  agents: ManagedAgent[];
  loading: boolean;
  pending: PendingAction | null;
  profile: AgentProfile;
  onConfirm: (confirmation: Confirmation) => void;
  onReactivate: (agent: ManagedAgent) => void;
}): React.ReactElement {
  return (
    <Table containerClassName="rounded-lg border">
      <TableHeader className="bg-muted/40">
        <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
          <TableHead>Name</TableHead>
          <TableHead>Access</TableHead>
          <TableHead className="w-24">Status</TableHead>
          <TableHead className="w-28 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell className="h-24 text-center text-muted-foreground" colSpan={4}>
              Loading {profile === "mailbox" ? "mailbox agents" : "provisioning keys"}…
            </TableCell>
          </TableRow>
        ) : null}
        {!loading && agents.length === 0 ? (
          <TableRow>
            <TableCell className="h-24 text-center text-muted-foreground" colSpan={4}>
              No {profile === "mailbox" ? "mailbox agents" : "provisioning keys"} yet.
            </TableCell>
          </TableRow>
        ) : null}
        {!loading
          ? agents.map((agent) => {
              const isPending = pending?.agentId === agent.id;
              const mailboxDeleted =
                agent.profile === "mailbox" && agent.mailbox?.isDeleted === true;
              return (
                <TableRow key={agent.id}>
                  <TableCell>
                    <span className="block font-medium">{agent.name}</span>
                  </TableCell>
                  <TableCell>
                    <AgentScope agent={agent} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={agent.isActive && !mailboxDeleted ? "secondary" : "outline"}>
                      {mailboxDeleted ? "Mailbox deleted" : agent.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {mailboxDeleted ? (
                      <span className="text-xs text-muted-foreground">Restore mailbox first</span>
                    ) : agent.isActive ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={`Actions for ${agent.name}`}
                            disabled={isPending}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <PiDotsThree />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2"
                            onSelect={() => onConfirm({ action: "rotate", agent })}
                          >
                            <PiArrowClockwise />
                            Rotate credential
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 text-destructive"
                            onSelect={() => onConfirm({ action: "disable", agent })}
                          >
                            <PiPause />
                            Disable
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Button
                        disabled={isPending}
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => onReactivate(agent)}
                      >
                        {isPending ? "Reactivating…" : "Reactivate"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          : null}
      </TableBody>
    </Table>
  );
}

function AgentScope({ agent }: { agent: ManagedAgent }): React.ReactElement {
  if (agent.profile === "mailbox") {
    return (
      <>
        <span className="block max-w-56 truncate">
          {agent.mailbox?.address ?? "Mailbox unavailable"}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {agent.accessLevel === "agent" ? "Handle mail" : "Read only"}
        </span>
      </>
    );
  }

  return (
    <>
      <span className="block max-w-56 truncate">
        {agent.mailDomain?.domain ?? "Domain unavailable"}
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">
        {agent.mailboxCount ?? 0} of {agent.mailboxLimit ?? 0} mailboxes
      </span>
    </>
  );
}

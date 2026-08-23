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
import type { AgentCredentialResult, ManagedAgent } from "./types";

type DomainOption = { id: string; name: string; isEnabled: boolean };
type Confirmation = { action: "disable" | "rotate"; agent: ManagedAgent };
type PendingAction = { action: "disable" | "reactivate" | "rotate"; agentId: string };
type CredentialState = AgentCredentialReveal & { refreshWorkspace: boolean };

export function AgentSettings({
  domains,
  mailboxes,
  onChanged
}: {
  domains: DomainOption[];
  mailboxes: Mailbox[];
  onChanged: () => Promise<void>;
}): React.ReactElement {
  const [agents, setAgents] = React.useState<ManagedAgent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null);
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [credential, setCredential] = React.useState<CredentialState | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setAgents(await listAgents());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agents could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

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
            : "Provisioner disabled."
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
          <AgentCreateDialog domains={domains} mailboxes={mailboxes} onCreated={handleCreated} />
        }
        description="Give software a restricted mailbox or permission to create mailboxes."
        title="Agents"
      >
        <AgentTable
          agents={agents}
          loading={loading}
          pending={pending}
          onConfirm={setConfirmation}
          onReactivate={(agent) => void reactivate(agent)}
        />
      </SettingsSection>

      <AgentCredentialDialog reveal={credential} onDone={() => void finishCredentialReveal()} />

      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogContent className="w-[min(92vw,480px)]">
          <DialogHeader>
            <DialogTitle>
              {confirmation?.action === "rotate" ? "Rotate credential?" : "Disable agent?"}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.action === "rotate"
                ? "The current credential will stop working immediately."
                : confirmation?.agent.profile === "mailbox"
                  ? "The mailbox and address will keep receiving mail. Existing messages and audit history will remain."
                  : "This provisioner will no longer be able to create mailboxes."}
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
              {confirmation?.action === "rotate" ? "Rotate credential" : "Disable agent"}
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
  onConfirm,
  onReactivate
}: {
  agents: ManagedAgent[];
  loading: boolean;
  pending: PendingAction | null;
  onConfirm: (confirmation: Confirmation) => void;
  onReactivate: (agent: ManagedAgent) => void;
}): React.ReactElement {
  return (
    <Table containerClassName="rounded-lg border">
      <TableHeader className="bg-muted/40">
        <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
          <TableHead>Name</TableHead>
          <TableHead className="hidden w-36 sm:table-cell">Type</TableHead>
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
            <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
              Loading agents…
            </TableCell>
          </TableRow>
        ) : null}
        {!loading && agents.length === 0 ? (
          <TableRow>
            <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
              No agents yet.
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
                    <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                      {agent.profile === "mailbox" ? "Mailbox agent" : "Provisioner"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {agent.profile === "mailbox" ? "Mailbox agent" : "Provisioner"}
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

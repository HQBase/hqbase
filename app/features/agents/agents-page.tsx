import * as React from "react";
import { PiPlus } from "react-icons/pi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { CurrentUser } from "@/features/auth/types";
import {
  listOAuthConnections,
  type OAuthConnection,
  revokeOAuthConnection
} from "@/features/connected-apps/api";
import { restoreMailbox } from "@/features/mailboxes/api";
import type { Mailbox } from "@/features/mailboxes/types";
import { SettingsSection } from "@/features/settings/settings-section";
import { AddConnectionDialog } from "./add-connection-dialog";
import {
  AgentCredentialDialog,
  type AgentCredentialReveal,
  AgentSetupDialog
} from "./agent-credential-dialog";
import { listAgents, rotateAgentCredential, setAgentActive } from "./api";
import { type ConnectionRow, ConnectionsTable } from "./connections-table";
import type { AgentCredentialResult, ManagedAgent } from "./types";

type Confirmation =
  | { action: "revoke"; connection: OAuthConnection }
  | { action: "disable" | "rotate"; agent: ManagedAgent };
type CredentialState = AgentCredentialReveal & { refreshWorkspace: boolean };

export function AgentsPage({
  canManage,
  domains,
  mailboxes,
  user,
  onChanged
}: {
  canManage: boolean;
  domains: Array<{ id: string; name: string; isEnabled: boolean }>;
  mailboxes: Mailbox[];
  user: CurrentUser;
  onChanged: () => Promise<void>;
}): React.ReactElement {
  const [oauthConnections, setOAuthConnections] = React.useState<OAuthConnection[]>([]);
  const [agents, setAgents] = React.useState<ManagedAgent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [credential, setCredential] = React.useState<CredentialState | null>(null);
  const [setupAgent, setSetupAgent] = React.useState<ManagedAgent | null>(null);

  const refreshConnections = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [oauthResult, agentsResult] = await Promise.allSettled([
      listOAuthConnections(),
      canManage ? listAgents() : Promise.resolve([])
    ]);

    if (oauthResult.status === "fulfilled") setOAuthConnections(oauthResult.value);
    if (agentsResult.status === "fulfilled") setAgents(agentsResult.value);

    const failure = [oauthResult, agentsResult].find((result) => result.status === "rejected");
    if (failure?.status === "rejected") {
      setLoadError(true);
      toast.error(
        failure.reason instanceof Error
          ? failure.reason.message
          : "Some connections could not be loaded."
      );
    }
    setLoading(false);
  }, [canManage]);

  React.useEffect(() => {
    void refreshConnections();
  }, [refreshConnections]);

  const rows = React.useMemo<ConnectionRow[]>(
    () =>
      [
        ...oauthConnections.map(
          (connection): ConnectionRow => ({
            id: oauthRowId(connection),
            kind: "oauth",
            connection
          })
        ),
        ...agents.map((agent): ConnectionRow => ({ id: agentRowId(agent), kind: "machine", agent }))
      ].sort((left, right) => rowName(left).localeCompare(rowName(right))),
    [agents, oauthConnections]
  );

  function updateAgent(agent: ManagedAgent): void {
    setAgents((current) => {
      const otherAgents = current.filter((item) => item.id !== agent.id);
      return [...otherAgents, agent].sort((left, right) => left.name.localeCompare(right.name));
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

  function startRotate(agent: ManagedAgent): void {
    setSetupAgent(null);
    setConfirmation({ action: "rotate", agent });
  }

  async function enableAgent(agent: ManagedAgent): Promise<void> {
    setSetupAgent(null);
    setPendingId(agentRowId(agent));
    try {
      const result = await setAgentActive(agent.id, true);
      if (!result.credential) throw new Error("The new credential was not returned.");
      updateAgent(result.agent);
      revealCredential({ agent: result.agent, credential: result.credential });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The identity could not be enabled.");
    } finally {
      setPendingId(null);
    }
  }

  async function restoreAgentMailbox(agent: ManagedAgent): Promise<void> {
    if (agent.profile !== "mailbox" || !agent.mailbox) return;
    setPendingId(agentRowId(agent));
    try {
      const mailbox = await restoreMailbox(agent.mailbox.id);
      updateAgent({
        ...agent,
        isActive: false,
        mailbox: {
          id: mailbox.id,
          address: mailbox.address,
          displayName: mailbox.displayName,
          isDeleted: mailbox.deletedAt !== null
        }
      });
      toast.success(`${mailbox.address} restored. Enable its identity to create a new credential.`);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mailbox could not be restored.");
    } finally {
      setPendingId(null);
    }
  }

  async function confirmAction(): Promise<void> {
    if (!confirmation) return;
    setPendingId(
      confirmation.action === "revoke"
        ? oauthRowId(confirmation.connection)
        : agentRowId(confirmation.agent)
    );
    try {
      if (confirmation.action === "revoke") {
        await revokeOAuthConnection(confirmation.connection.clientId);
        setOAuthConnections((current) =>
          current.filter((connection) => connection.clientId !== confirmation.connection.clientId)
        );
        toast.success(`${confirmation.connection.name} disconnected.`);
      } else if (confirmation.action === "rotate") {
        const result = await rotateAgentCredential(confirmation.agent.id);
        updateAgent(result.agent);
        revealCredential(result);
      } else {
        const result = await setAgentActive(confirmation.agent.id, false);
        updateAgent(result.agent);
        toast.success(
          confirmation.agent.profile === "mailbox"
            ? "Identity disabled. Its mailbox remains active."
            : "Provisioning key disabled."
        );
      }
      setConfirmation(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The connection could not be updated.");
    } finally {
      setPendingId(null);
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
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <SettingsSection
          action={
            <Button size="sm" type="button" onClick={() => setAddOpen(true)}>
              <PiPlus data-icon="inline-start" />
              Add connection
            </Button>
          }
          description="Manage assistants that act for you and software identities with their own credentials."
          title="All connections"
        >
          <ConnectionsTable
            loadError={loadError}
            loading={loading}
            pendingId={pendingId}
            rows={rows}
            onDisable={(agent) => setConfirmation({ action: "disable", agent })}
            onEnable={(agent) => void enableAgent(agent)}
            onRevoke={(connection) => setConfirmation({ action: "revoke", connection })}
            onRestore={(agent) => void restoreAgentMailbox(agent)}
            onRotate={startRotate}
            onSetup={setSetupAgent}
          />
        </SettingsSection>
      </div>

      <AddConnectionDialog
        canManage={canManage}
        domains={domains}
        mailboxes={mailboxes}
        open={addOpen}
        user={user}
        onCreated={handleCreated}
        onOpenChange={setAddOpen}
      />

      <AgentSetupDialog agent={setupAgent} onClose={() => setSetupAgent(null)} />
      <AgentCredentialDialog reveal={credential} onDone={() => void finishCredentialReveal()} />
      <ConfirmationDialog
        confirmation={confirmation}
        pending={pendingId !== null}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void confirmAction()}
      />
    </div>
  );
}

function ConfirmationDialog({
  confirmation,
  pending,
  onCancel,
  onConfirm
}: {
  confirmation: Confirmation | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  const title =
    confirmation?.action === "revoke"
      ? "Revoke connection?"
      : confirmation?.action === "rotate"
        ? "Rotate credential?"
        : confirmation?.agent.profile === "provisioner"
          ? "Disable provisioning key?"
          : "Disable mailbox identity?";
  const description =
    confirmation?.action === "revoke"
      ? `${confirmation.connection.name} will lose access immediately. This does not end your browser session or affect another workspace member.`
      : confirmation?.action === "rotate"
        ? "The current credential will stop working immediately. The new credential is shown once."
        : confirmation?.agent.profile === "mailbox"
          ? "The mailbox and address will keep receiving mail. Existing messages and audit history will remain."
          : "This provisioning key will no longer be able to create mailbox identities.";

  return (
    <Dialog open={confirmation !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="w-[min(92vw,480px)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button disabled={pending} type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            type="button"
            variant={confirmation?.action === "disable" ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmation?.action === "revoke"
              ? "Revoke"
              : confirmation?.action === "rotate"
                ? "Rotate credential"
                : "Disable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function oauthRowId(connection: OAuthConnection): string {
  return `oauth:${connection.clientId}`;
}

function agentRowId(agent: ManagedAgent): string {
  return `machine:${agent.id}`;
}

function rowName(row: ConnectionRow): string {
  return row.kind === "oauth" ? row.connection.name : row.agent.name;
}

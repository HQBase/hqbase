import type * as React from "react";
import {
  PiArrowClockwise,
  PiArrowCounterClockwise,
  PiDotsThree,
  PiFileText,
  PiKey,
  PiMailbox,
  PiPause,
  PiPlay,
  PiPlug,
  PiTrash
} from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import type { OAuthConnection } from "@/features/connected-apps/api";
import type { ManagedAgent } from "./types";

export type ConnectionRow =
  | { id: string; kind: "oauth"; connection: OAuthConnection }
  | { id: string; kind: "machine"; agent: ManagedAgent };

export function ConnectionsTable({
  loadError,
  loading,
  pendingId,
  rows,
  onDisable,
  onEnable,
  onRevoke,
  onRestore,
  onRotate,
  onSetup
}: {
  loadError: boolean;
  loading: boolean;
  pendingId: string | null;
  rows: ConnectionRow[];
  onDisable: (agent: ManagedAgent) => void;
  onEnable: (agent: ManagedAgent) => void;
  onRevoke: (connection: OAuthConnection) => void;
  onRestore: (agent: ManagedAgent) => void;
  onRotate: (agent: ManagedAgent) => void;
  onSetup: (agent: ManagedAgent) => void;
}): React.ReactElement {
  return (
    <Table
      className="block sm:table"
      containerClassName="overflow-hidden rounded-lg border sm:overflow-auto"
    >
      <TableHeader className="hidden bg-muted/40 sm:table-header-group">
        <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
          <TableHead>Name</TableHead>
          <TableHead className="w-36">Access</TableHead>
          <TableHead className="w-32">Status</TableHead>
          <TableHead className="w-16 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="block sm:table-row-group">
        {loading ? <MessageRow>Loading connections…</MessageRow> : null}
        {!loading && loadError ? (
          <MessageRow>Some connections could not be loaded. Try again later.</MessageRow>
        ) : null}
        {!loading && !loadError && rows.length === 0 ? (
          <MessageRow>No connections yet.</MessageRow>
        ) : null}
        {!loading
          ? rows.map((row) =>
              row.kind === "oauth" ? (
                <OAuthRow
                  connection={row.connection}
                  key={row.id}
                  pending={pendingId === row.id}
                  onRevoke={onRevoke}
                />
              ) : (
                <MachineRow
                  agent={row.agent}
                  key={row.id}
                  pending={pendingId === row.id}
                  onDisable={onDisable}
                  onEnable={onEnable}
                  onRestore={onRestore}
                  onRotate={onRotate}
                  onSetup={onSetup}
                />
              )
            )
          : null}
      </TableBody>
    </Table>
  );
}

function MessageRow({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <TableRow className="block sm:table-row">
      <TableCell
        className="block h-24 py-8 text-center text-muted-foreground sm:table-cell"
        colSpan={4}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

function OAuthRow({
  connection,
  pending,
  onRevoke
}: {
  connection: OAuthConnection;
  pending: boolean;
  onRevoke: (connection: OAuthConnection) => void;
}): React.ReactElement {
  const access = oauthAccessLabel(connection.scopes);
  const connectionType = connectionLabel(connection.resources);

  return (
    <TableRow className="grid grid-cols-[minmax(0,1fr)_44px] sm:table-row">
      <TableCell className="min-w-0 py-3 sm:table-cell sm:py-1">
        <Name icon={<PiPlug />} name={connection.name} secondary={connectionType} />
        <MobileDetails access={access} status="Authorized" />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant="secondary">{access}</Badge>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <StatusBadge status="Authorized" />
      </TableCell>
      <TableCell className="flex items-center justify-end px-1.5 text-right sm:table-cell sm:px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${connection.name}`}
              disabled={pending}
              size="icon"
              type="button"
              variant="ghost"
            >
              <PiDotsThree aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="gap-2 text-destructive"
                onSelect={() => onRevoke(connection)}
              >
                <PiTrash aria-hidden="true" />
                Revoke connection
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function MachineRow({
  agent,
  pending,
  onDisable,
  onEnable,
  onRestore,
  onRotate,
  onSetup
}: {
  agent: ManagedAgent;
  pending: boolean;
  onDisable: (agent: ManagedAgent) => void;
  onEnable: (agent: ManagedAgent) => void;
  onRestore: (agent: ManagedAgent) => void;
  onRotate: (agent: ManagedAgent) => void;
  onSetup: (agent: ManagedAgent) => void;
}): React.ReactElement {
  const mailboxDeleted = agent.profile === "mailbox" && agent.mailbox?.isDeleted === true;
  const status = mailboxDeleted ? "Deleted" : agent.isActive ? "Enabled" : "Disabled";
  const access = machineAccessLabel(agent);

  return (
    <TableRow className="grid grid-cols-[minmax(0,1fr)_44px] sm:table-row">
      <TableCell className="min-w-0 py-3 sm:table-cell sm:py-1">
        <Name
          icon={agent.profile === "mailbox" ? <PiMailbox /> : <PiKey />}
          name={agent.name}
          secondary={machineDescription(agent)}
        />
        <MobileDetails access={access} status={status} />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant="secondary">{access}</Badge>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <StatusBadge status={status} />
      </TableCell>
      <TableCell className="flex items-center justify-end px-1.5 text-right sm:table-cell sm:px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${agent.name}`}
              disabled={pending}
              size="icon"
              type="button"
              variant="ghost"
            >
              <PiDotsThree />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {mailboxDeleted ? (
              <DropdownMenuGroup>
                <DropdownMenuItem className="gap-2" onSelect={() => onRestore(agent)}>
                  <PiArrowCounterClockwise />
                  Restore mailbox
                </DropdownMenuItem>
              </DropdownMenuGroup>
            ) : agent.isActive ? (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem className="gap-2" onSelect={() => onSetup(agent)}>
                    <PiFileText />
                    Setup instructions
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem className="gap-2" onSelect={() => onRotate(agent)}>
                    <PiArrowClockwise />
                    Rotate credential
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 text-destructive"
                    onSelect={() => onDisable(agent)}
                  >
                    <PiPause />
                    Disable
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem className="gap-2" onSelect={() => onEnable(agent)}>
                    <PiPlay />
                    Enable
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem className="gap-2" onSelect={() => onSetup(agent)}>
                    <PiFileText />
                    Setup instructions
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function Name({
  icon,
  name,
  secondary
}: {
  icon: React.ReactNode;
  name: string;
  secondary: string;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{secondary}</span>
      </span>
    </div>
  );
}

function MobileDetails({ access, status }: { access: string; status: string }): React.ReactElement {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6 sm:hidden">
      <Badge variant="secondary">{access}</Badge>
      <StatusBadge status={status} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  return (
    <Badge variant={status === "Authorized" || status === "Enabled" ? "secondary" : "outline"}>
      {status}
    </Badge>
  );
}

export function oauthAccessLabel(scopes: readonly string[]): string {
  return scopes.includes("mail:write") || scopes.includes("mail:send")
    ? "Handle mail"
    : "Read only";
}

export function connectionLabel(resources: readonly string[]): string {
  const labels = resources.map((resource) => {
    let path = resource;
    try {
      path = new URL(resource).pathname;
    } catch {
      // Keep the stored value for a non-URL resource.
    }
    if (path === "/mcp/full") return "MCP · Mail actions";
    if (path === "/mcp") return "MCP · Read only";
    if (path === "/api/v2") return "Mail API";
    if (path === "/api/v1") return "Mail API · Legacy";
    return "OAuth";
  });
  return [...new Set(labels)].join(", ") || "OAuth";
}

function machineAccessLabel(agent: ManagedAgent): string {
  if (agent.profile === "provisioner") return "Provisioning";
  return agent.accessLevel === "agent" ? "Handle mail" : "Read only";
}

function machineDescription(agent: ManagedAgent): string {
  if (agent.profile === "mailbox") return agent.mailbox?.address ?? "Mailbox unavailable";
  const domain = agent.mailDomain?.domain ?? "Domain unavailable";
  return `${domain} · ${agent.mailboxCount ?? 0} of ${agent.mailboxLimit ?? 0} mailboxes`;
}

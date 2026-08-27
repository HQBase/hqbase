import * as React from "react";
import { PiPlug, PiTrash } from "react-icons/pi";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentSkillDetails } from "@/features/agents/connection-dialog";
import type { CurrentUser } from "@/features/auth/types";
import { McpConnectionDetails } from "@/features/mcp/connection-dialog";
import { SettingsSection } from "@/features/settings/settings-section";
import { listOAuthConnections, type OAuthConnection, revokeOAuthConnection } from "./api";

type ConnectedAppsTab = "mcp" | "skill" | "connections";

export function ConnectedAppsPage({ user }: { user: CurrentUser }): React.ReactElement {
  const [readOnlyEndpoint, setReadOnlyEndpoint] = React.useState("/mcp");
  const [fullEndpoint, setFullEndpoint] = React.useState("/mcp/full");
  const [skillUrl, setSkillUrl] = React.useState("/skills/hqbase-mail/SKILL.md");
  const readOnlyEndpointId = React.useId();
  const fullEndpointId = React.useId();
  const skillUrlId = React.useId();
  const [connections, setConnections] = React.useState<OAuthConnection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<ConnectedAppsTab | null>(null);

  React.useEffect(() => {
    setReadOnlyEndpoint(new URL("/mcp", window.location.origin).toString());
    setFullEndpoint(new URL("/mcp/full", window.location.origin).toString());
    setSkillUrl(new URL("/skills/hqbase-mail/SKILL.md", window.location.origin).toString());
  }, []);

  React.useEffect(() => {
    let active = true;
    void listOAuthConnections()
      .then((next) => {
        if (!active) return;
        setConnections(next);
        setActiveTab((current) => current ?? "mcp");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setActiveTab((current) => current ?? "mcp");
        toast.error(error instanceof Error ? error.message : "Connections could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Tabs
      className="flex flex-col gap-2"
      value={activeTab ?? "mcp"}
      onValueChange={(value) => setActiveTab(value as ConnectedAppsTab)}
    >
      <TabsList
        aria-label="Connected apps view"
        className="grid h-9 w-full grid-cols-3 rounded-full"
      >
        <TabsTrigger className="h-7 min-h-0 rounded-full px-2 text-xs" value="mcp">
          MCP
        </TabsTrigger>
        <TabsTrigger className="h-7 min-h-0 rounded-full px-2 text-xs" value="skill">
          Skill + API
        </TabsTrigger>
        <TabsTrigger className="h-7 min-h-0 rounded-full px-2 text-xs" value="connections">
          Connections
        </TabsTrigger>
      </TabsList>

      {activeTab === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading connected apps…</p>
      ) : (
        <>
          <TabsContent value="mcp">
            <SettingsSection
              description="Connect an AI tool through HQBase's remote MCP server."
              title="MCP"
            >
              <McpConnectionDetails
                fullEndpoint={fullEndpoint}
                fullEndpointId={fullEndpointId}
                readOnlyEndpoint={readOnlyEndpoint}
                readOnlyEndpointId={readOnlyEndpointId}
                user={user}
              />
            </SettingsSection>
          </TabsContent>

          <TabsContent value="skill">
            <SettingsSection
              description="Give an agent the public skill for HQBase's v2 Mail API."
              title="Skill + API"
            >
              <AgentSkillDetails flat skillUrl={skillUrl} skillUrlId={skillUrlId} />
            </SettingsSection>
          </TabsContent>

          <TabsContent value="connections">
            <ConnectionList
              connections={connections}
              loading={loading}
              onRevoked={(clientId) =>
                setConnections((current) =>
                  current.filter((connection) => connection.clientId !== clientId)
                )
              }
            />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}

function ConnectionList({
  connections,
  loading,
  onRevoked
}: {
  connections: OAuthConnection[];
  loading: boolean;
  onRevoked: (clientId: string) => void;
}): React.ReactElement {
  const [selected, setSelected] = React.useState<OAuthConnection | null>(null);
  const [pending, setPending] = React.useState(false);

  async function revoke(): Promise<void> {
    if (!selected) return;
    setPending(true);
    try {
      await revokeOAuthConnection(selected.clientId);
      onRevoked(selected.clientId);
      toast.success(`${selected.name} disconnected.`);
      setSelected(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection could not be revoked.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SettingsSection
        description="These apps act for you. Other workspace members manage their own connections."
        title="Your connections"
      >
        <Table containerClassName="rounded-lg border">
          <TableHeader className="bg-muted/40">
            <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
              <TableHead>App</TableHead>
              <TableHead className="w-32">Access</TableHead>
              <TableHead className="hidden sm:table-cell">Connection</TableHead>
              <TableHead className="w-20 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={4}>
                  Loading connections…
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && connections.length === 0 ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={4}>
                  No connected apps yet.
                </TableCell>
              </TableRow>
            ) : null}
            {connections.map((connection) => (
              <TableRow key={connection.clientId}>
                <TableCell>
                  <span className="flex items-center gap-2 font-medium">
                    <PiPlug aria-hidden="true" className="size-4 text-muted-foreground" />
                    {connection.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                    {connectionLabel(connection.resources)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{accessLabel(connection.scopes)}</Badge>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {connectionLabel(connection.resources)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    aria-label={`Revoke ${connection.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={() => setSelected(connection)}
                  >
                    <PiTrash />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SettingsSection>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="w-[min(92vw,480px)]">
          <DialogHeader>
            <DialogTitle>Revoke connection?</DialogTitle>
            <DialogDescription>
              {selected?.name} will lose access immediately. This does not end your browser session
              or affect another workspace member.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={pending} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={pending}
              type="button"
              variant="destructive"
              onClick={() => void revoke()}
            >
              {pending ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function accessLabel(scopes: readonly string[]): string {
  return scopes.includes("mail:write") || scopes.includes("mail:send")
    ? "Handle mail"
    : "Read only";
}

function connectionLabel(resources: readonly string[]): string {
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

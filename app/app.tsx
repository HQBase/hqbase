import * as React from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/features/auth/api";
import { LoginPage } from "@/features/auth/login-page";
import type { CurrentUser } from "@/features/auth/types";
import { InboxPage } from "@/features/inbox/inbox-page";
import { listMailboxes } from "@/features/mailboxes/api";
import type { Mailbox } from "@/features/mailboxes/types";
import { listConversations, listMessages } from "@/features/messages/api";
import { mergeIncomingMessageIds } from "@/features/messages/incoming-sound";
import type { ConversationSummary } from "@/features/messages/types";
import { SettingsPage } from "@/features/settings/settings-page";
import { getSetupStatus } from "@/features/setup/api";
import { SetupPage } from "@/features/setup/setup-page";
import type { SetupStatus } from "@/features/setup/types";
import { getUpdateStatus } from "@/features/updates/api";
import type { UpdateStatus } from "@/features/updates/types";
import { listUsers } from "@/features/users/api";
import type { WorkspaceUser } from "@/features/users/types";
import { playNotificationSound } from "@/lib/notification-sounds";
import type { FolderId, MailFolderId, SettingsTabId } from "@/lib/routes";
import { useAppRoute } from "@/lib/use-app-route";

const ComposeDialog = React.lazy(() =>
  import("@/features/compose/compose-dialog").then((module) => ({ default: module.ComposeDialog }))
);

export function App(): React.ReactElement {
  const [setup, setSetup] = React.useState<SetupStatus | null>(null);
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [mailboxes, setMailboxes] = React.useState<Mailbox[]>([]);
  const [users, setUsers] = React.useState<WorkspaceUser[]>([]);
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [mailboxId, setMailboxId] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [updateStatus, setUpdateStatus] = React.useState<UpdateStatus | null>(null);
  const knownIncomingMessageIds = React.useRef<Set<string> | null>(null);
  const { navigate, route } = useAppRoute(setup?.isComplete);
  const activeFolder: FolderId = route.kind === "settings" ? "settings" : route.folder;
  const selectedId = route.kind === "mail" ? route.messageId : null;
  const settingsTab: SettingsTabId = route.kind === "settings" ? route.tab : "mailboxes";
  const currentUserId = user?.id ?? null;
  const contentMailboxes = React.useMemo(
    () => mailboxes.filter((mailbox) => mailbox.accessLevel !== null),
    [mailboxes]
  );

  const loadWorkspace = React.useCallback(async (currentUser: CurrentUser) => {
    const [nextSetup, nextMailboxes] = await Promise.all([getSetupStatus(), listMailboxes()]);
    setSetup(nextSetup);
    setMailboxes(nextMailboxes);

    if (currentUser.role === "owner" || currentUser.role === "admin") {
      setUsers(await listUsers());
      void getUpdateStatus()
        .then(setUpdateStatus)
        .catch(() => {
          // Update discovery never delays workspace startup.
        });
    } else {
      setUsers([]);
      setUpdateStatus(null);
    }
  }, []);

  const reload = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const setupStatus = await getSetupStatus();
      setSetup(setupStatus);
      if (!setupStatus.isComplete) {
        setUser(null);
        return;
      }

      const currentUser = await getCurrentUser();
      setUser(currentUser);
      await loadWorkspace(currentUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [loadWorkspace]);

  const reloadConversations = React.useCallback(async () => {
    if (!user || activeFolder === "settings") return;
    const nextConversations = await listConversations({
      folder: activeFolder,
      mailboxId: mailboxId === "all" ? undefined : mailboxId,
      search: search || undefined
    });
    setConversations(nextConversations);
  }, [activeFolder, mailboxId, search, user]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    void reloadConversations().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Conversations failed to load.");
    });
  }, [reloadConversations]);

  React.useEffect(() => {
    if (!user || (user.role !== "owner" && user.role !== "admin")) return;
    const interval = window.setInterval(
      () => {
        void getUpdateStatus()
          .then(setUpdateStatus)
          .catch(() => {
            // Update discovery must never interrupt mail work.
          });
      },
      6 * 60 * 60 * 1000
    );
    return () => window.clearInterval(interval);
  }, [user]);

  React.useEffect(() => {
    knownIncomingMessageIds.current = null;
    if (!currentUserId) return;
    let active = true;
    let checking = false;
    const checkIncomingMail = async () => {
      if (checking) return;
      checking = true;
      try {
        const latestMessages = await listMessages({});
        if (!active) return;
        const snapshot = mergeIncomingMessageIds(knownIncomingMessageIds.current, latestMessages);
        knownIncomingMessageIds.current = snapshot.knownIds;
        if (snapshot.hasNewMessages) playNotificationSound("incoming-email");
      } catch {
        // Incoming-mail discovery never interrupts the current workspace.
      } finally {
        checking = false;
      }
    };

    void checkIncomingMail();
    const interval = window.setInterval(() => {
      if (active) void checkIncomingMail();
    }, 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [currentUserId]);

  React.useEffect(() => {
    if (!user || activeFolder === "settings") return;

    const interval = window.setInterval(() => {
      void reloadConversations().catch(() => {
        // Keep background refresh failures quiet; the next interval will retry.
      });
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [activeFolder, reloadConversations, user]);

  React.useEffect(() => {
    if (!user || isLoading || route.kind !== "settings") return;
    const canManage = user.role === "owner" || user.role === "admin";
    const managementOnly = ["domains", "updates"].includes(route.tab);
    if (!canManage && managementOnly) {
      navigate({ kind: "settings", tab: "mailboxes" }, true);
    }
  }, [isLoading, navigate, route, user]);

  if (isLoading && setup === null) {
    return <FullScreenStatus label="Loading HQBase" />;
  }

  if (!setup?.isComplete) {
    return (
      <>
        <SetupPage onComplete={() => void reload()} />
        <Toaster />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <LoginPage onLogin={() => void reload()} />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <AppShell
        activeFolder={activeFolder}
        immersiveOnCompact={activeFolder !== "settings" && selectedId !== null}
        mailboxId={mailboxId}
        mailboxes={contentMailboxes}
        search={search}
        user={user}
        updateStatus={updateStatus}
        onOpenUpdates={() => {
          navigate({ kind: "settings", tab: "updates" });
        }}
        onCompose={() => {
          setComposeOpen(true);
        }}
        onFolderChange={(folder) => {
          navigate(
            folder === "settings"
              ? { kind: "settings", tab: "mailboxes" }
              : { kind: "mail", folder, messageId: null }
          );
        }}
        onMailboxChange={setMailboxId}
        onSearchChange={setSearch}
        onSignedOut={() => {
          setUser(null);
          setConversations([]);
        }}
      >
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            {activeFolder === "settings" ? (
              <SettingsPage
                activeTab={settingsTab}
                canManage={user.role === "owner" || user.role === "admin"}
                mailboxes={mailboxes}
                setup={setup}
                users={users}
                onRefresh={() => void reload()}
                onTabChange={(tab) => navigate({ kind: "settings", tab })}
                updateStatus={updateStatus}
              />
            ) : (
              <InboxPage
                activeFolder={activeFolder as MailFolderId}
                conversations={conversations}
                mailboxes={contentMailboxes}
                selectedId={selectedId}
                onRefresh={() => void reloadConversations()}
                onMessageRouteChange={(folder, messageId) =>
                  navigate({ kind: "mail", folder, messageId })
                }
                onSelect={(messageId) =>
                  navigate({ kind: "mail", folder: activeFolder as MailFolderId, messageId })
                }
              />
            )}
          </div>
        </div>
      </AppShell>
      {composeOpen ? (
        <React.Suspense fallback={null}>
          <ComposeDialog
            mailboxes={contentMailboxes}
            mode="new"
            open={composeOpen}
            onOpenChange={setComposeOpen}
            onSent={() => void reloadConversations()}
          />
        </React.Suspense>
      ) : null}
      <Toaster />
    </>
  );
}

function FullScreenStatus({ label }: { label: string }): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {label}
    </main>
  );
}

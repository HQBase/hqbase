import * as React from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/features/auth/api";
import { LoginPage } from "@/features/auth/login-page";
import type { CurrentUser } from "@/features/auth/types";
import { getEntitlementStatus } from "@/features/billing/api";
import { BillingBanner } from "@/features/billing/billing-banner";
import type { EntitlementStatus } from "@/features/billing/types";
import { InboxPage } from "@/features/inbox/inbox-page";
import { listMailboxes } from "@/features/mailboxes/api";
import type { Mailbox } from "@/features/mailboxes/types";
import { listMessages } from "@/features/messages/api";
import type { MessageDetail, MessageSummary } from "@/features/messages/types";
import { SettingsPage } from "@/features/settings/settings-page";
import { getSetupStatus } from "@/features/setup/api";
import { SetupPage } from "@/features/setup/setup-page";
import type { SetupStatus } from "@/features/setup/types";
import { getUpdateStatus } from "@/features/updates/api";
import type { UpdateStatus } from "@/features/updates/types";
import { getUpgradeLifecycle } from "@/features/upgrades/api";
import type { UpgradeLifecycle } from "@/features/upgrades/types";
import { UpgradeComplete } from "@/features/upgrades/upgrade-complete";
import { listUsers } from "@/features/users/api";
import type { WorkspaceUser } from "@/features/users/types";
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
  const [entitlement, setEntitlement] = React.useState<EntitlementStatus | null>(null);
  const [upgrade, setUpgrade] = React.useState<UpgradeLifecycle | null>(null);
  const [messages, setMessages] = React.useState<MessageSummary[]>([]);
  const [mailboxId, setMailboxId] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<MessageDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [updateStatus, setUpdateStatus] = React.useState<UpdateStatus | null>(null);
  const { navigate, route } = useAppRoute(setup?.isComplete);
  const activeFolder: FolderId = route.kind === "settings" ? "settings" : route.folder;
  const selectedId = route.kind === "mail" ? route.messageId : null;
  const settingsTab: SettingsTabId = route.kind === "settings" ? route.tab : "mailboxes";

  const loadWorkspace = React.useCallback(async (currentUser: CurrentUser) => {
    const [nextSetup, nextMailboxes] = await Promise.all([getSetupStatus(), listMailboxes()]);
    setSetup(nextSetup);
    setMailboxes(nextMailboxes);

    if (currentUser.role === "owner" || currentUser.role === "admin") {
      const [nextUsers, nextEntitlement, nextUpgrade] = await Promise.all([
        listUsers(),
        getEntitlementStatus(),
        getUpgradeLifecycle()
      ]);
      setUsers(nextUsers);
      setEntitlement(nextEntitlement);
      setUpgrade(nextUpgrade);
      void getUpdateStatus()
        .then(setUpdateStatus)
        .catch(() => {
          // Update discovery never delays workspace startup.
        });
    } else {
      setUsers([]);
      setEntitlement(null);
      setUpgrade(null);
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

  const reloadMessages = React.useCallback(async () => {
    if (!user || activeFolder === "settings") return;
    const folder = activeFolder === "starred" ? undefined : activeFolder;
    const nextMessages = await listMessages({
      folder,
      mailboxId: mailboxId === "all" ? undefined : mailboxId,
      search: search || undefined
    });
    const filtered =
      activeFolder === "starred"
        ? nextMessages.filter((message) => message.starredAt)
        : nextMessages;
    setMessages(filtered);
  }, [activeFolder, mailboxId, search, user]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    void reloadMessages().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Messages failed to load.");
    });
  }, [reloadMessages]);

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
    if (!user || activeFolder === "settings") return;

    const interval = window.setInterval(() => {
      void reloadMessages().catch(() => {
        // Keep background refresh failures quiet; the next interval will retry.
      });
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [activeFolder, reloadMessages, user]);

  React.useEffect(() => {
    if (!user || isLoading || route.kind !== "settings") return;
    const canManage = user.role === "owner" || user.role === "admin";
    const managementOnly = ["domains", "billing", "updates"].includes(route.tab);
    if ((!canManage && managementOnly) || (route.tab === "billing" && !entitlement)) {
      navigate({ kind: "settings", tab: "mailboxes" }, true);
    }
  }, [entitlement, isLoading, navigate, route, user]);

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

  const contentMailboxes = mailboxes.filter((mailbox) => mailbox.accessLevel !== null);

  return (
    <>
      <UpgradeComplete
        onOpenSettings={() => {
          navigate({ kind: "settings", tab: "billing" });
        }}
        onAddDomain={() => {
          navigate({ kind: "settings", tab: "domains" });
        }}
      />
      <AppShell
        activeFolder={activeFolder}
        mailboxId={mailboxId}
        mailboxes={contentMailboxes}
        search={search}
        user={user}
        updateStatus={updateStatus}
        onOpenUpdates={() => {
          navigate({ kind: "settings", tab: "updates" });
        }}
        onCompose={() => {
          setReplyTo(null);
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
          setMessages([]);
        }}
      >
        <div className="flex h-full flex-col">
          {entitlement ? <BillingBanner status={entitlement} /> : null}
          <div className="min-h-0 flex-1">
            {activeFolder === "settings" ? (
              <SettingsPage
                activeTab={settingsTab}
                canManage={user.role === "owner" || user.role === "admin"}
                entitlement={entitlement}
                upgrade={upgrade}
                mailboxes={mailboxes}
                setup={setup}
                users={users}
                onEntitlementChanged={setEntitlement}
                onUpgradeChanged={setUpgrade}
                onRefresh={() => void reload()}
                onTabChange={(tab) => navigate({ kind: "settings", tab })}
                updateStatus={updateStatus}
              />
            ) : (
              <InboxPage
                activeFolder={activeFolder as MailFolderId}
                messages={messages}
                selectedId={selectedId}
                onRefresh={() => void reloadMessages()}
                onReply={(message) => {
                  setReplyTo(message);
                  setComposeOpen(true);
                }}
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
            open={composeOpen}
            replyTo={replyTo}
            onOpenChange={setComposeOpen}
            onSent={() => void reloadMessages()}
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

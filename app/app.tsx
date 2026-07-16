import * as React from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/features/auth/api";
import { LoginPage } from "@/features/auth/login-page";
import type { CurrentUser } from "@/features/auth/types";
import { ComposeDialog } from "@/features/compose/compose-dialog";
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
import { UpgradeExperience } from "@/features/upgrades/upgrade-experience";
import { listUsers } from "@/features/users/api";
import type { WorkspaceUser } from "@/features/users/types";
import type { FolderId } from "@/lib/routes";

export function App(): React.ReactElement {
  const [setup, setSetup] = React.useState<SetupStatus | null>(null);
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [mailboxes, setMailboxes] = React.useState<Mailbox[]>([]);
  const [users, setUsers] = React.useState<WorkspaceUser[]>([]);
  const [messages, setMessages] = React.useState<MessageSummary[]>([]);
  const [activeFolder, setActiveFolder] = React.useState<FolderId>("inbox");
  const [mailboxId, setMailboxId] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<MessageDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [updateStatus, setUpdateStatus] = React.useState<UpdateStatus | null>(null);
  const [settingsTab, setSettingsTab] = React.useState("mailboxes");

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
    setSelectedId((current) => current ?? filtered[0]?.id ?? null);
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
      <UpgradeExperience />
      <AppShell
        activeFolder={activeFolder}
        mailboxId={mailboxId}
        mailboxes={mailboxes}
        search={search}
        user={user}
        updateStatus={updateStatus}
        onOpenUpdates={() => {
          setSettingsTab("updates");
          setActiveFolder("settings");
        }}
        onCompose={() => {
          setReplyTo(null);
          setComposeOpen(true);
        }}
        onFolderChange={(folder) => {
          setActiveFolder(folder);
          setSelectedId(null);
        }}
        onMailboxChange={setMailboxId}
        onSearchChange={setSearch}
        onSignedOut={() => {
          setUser(null);
          setMessages([]);
        }}
      >
        {activeFolder === "settings" ? (
          <SettingsPage
            key={settingsTab}
            canManage={user.role === "owner" || user.role === "admin"}
            mailboxes={mailboxes}
            setup={setup}
            users={users}
            onRefresh={() => void reload()}
            defaultTab={settingsTab}
            updateStatus={updateStatus}
          />
        ) : (
          <InboxPage
            messages={messages}
            selectedId={selectedId}
            onRefresh={() => void reloadMessages()}
            onReply={(message) => {
              setReplyTo(message);
              setComposeOpen(true);
            }}
            onSelect={setSelectedId}
          />
        )}
      </AppShell>
      <ComposeDialog
        canManage={user.role === "owner" || user.role === "admin"}
        mailboxes={mailboxes}
        open={composeOpen}
        replyTo={replyTo}
        onOpenChange={setComposeOpen}
        onSent={() => void reloadMessages()}
      />
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

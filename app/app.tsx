import * as React from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/features/auth/api";
import { LoginPage } from "@/features/auth/login-page";
import { safeAuthenticationReturnPath } from "@/features/auth/password-recovery";
import {
  ForgotPasswordPage,
  InvitationPasswordSetupPage,
  PasswordResetPage,
  TemporaryPasswordSetupPage
} from "@/features/auth/password-setup-page";
import type { CurrentUser } from "@/features/auth/types";
import { ComposerHost } from "@/features/compose/composer-host";
import { useDrafts } from "@/features/drafts/use-drafts";
import { useMailEvents } from "@/features/events/use-mail-events";
import { listLabels } from "@/features/labels/api";
import type { MailLabel } from "@/features/labels/types";
import { listDeletedMailboxes, listMailboxes } from "@/features/mailboxes/api";
import type { Mailbox } from "@/features/mailboxes/types";
import { useMailSync } from "@/features/messages/use-mail-sync";
import { mailDocumentTitle } from "@/features/notifications/unread";
import { type GlobalSearchResult, globalSearchResultPath } from "@/features/search/types";
import { getSetupStatus } from "@/features/setup/api";
import { SetupPage } from "@/features/setup/setup-page";
import type { SetupStatus } from "@/features/setup/types";
import { useUpdateMonitor } from "@/features/updates/use-update-monitor";
import { listUsers } from "@/features/users/api";
import type { WorkspaceUser } from "@/features/users/types";
import {
  type FolderId,
  isPublicAuthenticationPath,
  readAppRoute,
  type SettingsTabId
} from "@/lib/routes";
import { useAppRoute } from "@/lib/use-app-route";
import { WorkspacePages } from "@/workspace-pages";

export function App(): React.ReactElement {
  const publicAuthenticationPath = isPublicAuthenticationPath(window.location.pathname);
  const [setup, setSetup] = React.useState<SetupStatus | null>(null);
  const [user, setUser] = React.useState<CurrentUser | null | undefined>(undefined);
  const [mailboxes, setMailboxes] = React.useState<Mailbox[]>([]);
  const [labels, setLabels] = React.useState<MailLabel[]>([]);
  const [deletedMailboxes, setDeletedMailboxes] = React.useState<Mailbox[]>([]);
  const [users, setUsers] = React.useState<WorkspaceUser[]>([]);
  const [mailboxId, setMailboxId] = React.useState("all");
  const [labelIds, setLabelIds] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const { navigate, route } = useAppRoute(setup?.isComplete);
  const activeFolder: FolderId =
    route.kind === "settings"
      ? "settings"
      : route.kind === "agents"
        ? "agents"
        : route.kind === "contacts"
          ? "contacts"
          : route.kind === "drafts"
            ? "drafts"
            : route.folder;
  const settingsTab: SettingsTabId = route.kind === "settings" ? route.tab : "mailboxes";
  const currentUserId = user?.passwordSetupRequired ? null : (user?.id ?? null);
  const draftState = useDrafts(currentUserId);
  const contentMailboxes = React.useMemo(
    () => mailboxes.filter((mailbox) => mailbox.accessLevel !== null),
    [mailboxes]
  );
  const canManageUpdates =
    !user?.passwordSetupRequired && (user?.role === "owner" || user?.role === "admin");
  const updateMonitor = useUpdateMonitor(canManageUpdates);
  const mailSync = useMailSync({
    activeFolder,
    labelIds,
    mailboxId,
    search,
    userId: currentUserId
  });
  const selectedMailboxAddress = contentMailboxes.find(
    (mailbox) => mailbox.id === mailboxId
  )?.address;

  React.useEffect(() => {
    document.title = currentUserId
      ? mailDocumentTitle(mailSync.notifications.unread, mailboxId, selectedMailboxAddress)
      : "HQBase";
  }, [currentUserId, mailboxId, mailSync.notifications.unread, selectedMailboxAddress]);

  const loadWorkspace = React.useCallback(async (currentUser: CurrentUser) => {
    const [nextSetup, nextMailboxes, nextLabels] = await Promise.all([
      getSetupStatus(),
      listMailboxes(),
      listLabels()
    ]);
    setSetup(nextSetup);
    setMailboxes(nextMailboxes);
    setLabels(nextLabels);

    if (currentUser.role === "owner" || currentUser.role === "admin") {
      const [nextUsers, nextDeletedMailboxes] = await Promise.all([
        listUsers(),
        listDeletedMailboxes()
      ]);
      setUsers(nextUsers);
      setDeletedMailboxes(nextDeletedMailboxes);
    } else {
      setUsers([]);
      setDeletedMailboxes([]);
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
      if (currentUser.passwordSetupRequired) return;
      await loadWorkspace(currentUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [loadWorkspace]);

  const refreshWorkspace = React.useCallback(async () => {
    if (!currentUserId) return;
    const currentUser = await getCurrentUser();
    setUser(currentUser);
    if (!currentUser.passwordSetupRequired) await loadWorkspace(currentUser);
  }, [currentUserId, loadWorkspace]);
  const refreshRealtimeState = React.useCallback(
    async (hardRefresh = false) => {
      const results = await Promise.allSettled([
        refreshWorkspace(),
        hardRefresh ? mailSync.hardRefresh() : mailSync.refresh(),
        draftState.refresh()
      ]);
      if (results.every((result) => result.status === "rejected")) {
        const failure = results.find((result) => result.status === "rejected");
        throw failure?.reason;
      }
    },
    [draftState.refresh, mailSync.hardRefresh, mailSync.refresh, refreshWorkspace]
  );
  const hardRefreshRealtimeState = React.useCallback(
    () => refreshRealtimeState(true),
    [refreshRealtimeState]
  );

  const connectionStatus = useMailEvents(currentUserId, {
    onDrafts: draftState.refresh,
    onFallbackPoll: refreshRealtimeState,
    onLabels: hardRefreshRealtimeState,
    onMailboxes: hardRefreshRealtimeState,
    onMessages: mailSync.refresh,
    onReconnect: hardRefreshRealtimeState
  });

  React.useEffect(() => {
    if (publicAuthenticationPath) return;
    void reload();
  }, [publicAuthenticationPath, reload]);

  React.useEffect(() => {
    if (!user || isLoading) return;
    const canManage = user.role === "owner" || user.role === "admin";
    if (route.kind === "settings" && !canManage && ["domains", "updates"].includes(route.tab)) {
      navigate({ kind: "settings", tab: "mailboxes" }, true);
    }
  }, [isLoading, navigate, route, user]);

  React.useEffect(() => {
    if (mailboxId !== "all" && !contentMailboxes.some((mailbox) => mailbox.id === mailboxId)) {
      setMailboxId("all");
    }
  }, [contentMailboxes, mailboxId]);

  React.useEffect(() => {
    setLabelIds((current) => {
      const next = current.filter((id) => labels.some((label) => label.id === id));
      return next.length === current.length ? current : next;
    });
  }, [labels]);

  const refreshLabels = React.useCallback(async () => {
    setLabels(await listLabels());
  }, []);

  const selectSearchResult = React.useCallback(
    (result: GlobalSearchResult) => {
      navigate(readAppRoute(globalSearchResultPath(result)));
    },
    [navigate]
  );

  const submitSearch = React.useCallback(
    (query: string) => {
      setSearch(query);
      setSearchQuery(query);
      navigate({ kind: "mail", folder: "inbox", messageId: null });
    },
    [navigate]
  );

  if (publicAuthenticationPath) {
    const params = new URLSearchParams(window.location.search);
    const returnTo = safeAuthenticationReturnPath(params.get("returnTo"), window.location.origin);
    const page =
      window.location.pathname === "/forgot-password" ? (
        <ForgotPasswordPage returnTo={returnTo} />
      ) : window.location.pathname === "/reset-password" ? (
        <PasswordResetPage
          error={params.get("error")}
          returnTo={returnTo}
          token={params.get("token")}
        />
      ) : (
        <InvitationPasswordSetupPage error={params.get("error")} token={params.get("token")} />
      );
    return (
      <>
        {page}
        <Toaster />
      </>
    );
  }

  if (isLoading || user === undefined || setup === null) {
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

  if (user.passwordSetupRequired) {
    return (
      <>
        <TemporaryPasswordSetupPage
          user={user}
          onComplete={() => void reload()}
          onSignedOut={() => setUser(null)}
        />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <ComposerHost
        defaultFromMailboxId={user.defaultFromMailboxId}
        mailboxes={contentMailboxes}
        navigate={navigate}
        route={route}
        onDraftsChange={() => void draftState.refresh().catch(() => undefined)}
        onManageSignatures={() => navigate({ kind: "settings", tab: "signatures" })}
        onSent={() => void mailSync.refresh().catch(() => undefined)}
      >
        {({ openNew }) => (
          <AppShell
            activeFolder={activeFolder}
            activeSettingsTab={settingsTab}
            canManage={user.role === "owner" || user.role === "admin"}
            connectionStatus={connectionStatus}
            draftCount={draftState.drafts.length}
            mailboxId={mailboxId}
            mailboxes={contentMailboxes}
            unread={mailSync.notifications.unread}
            search={searchQuery}
            user={user}
            updateInProgress={updateMonitor.progress !== null}
            updateReady={updateMonitor.ready}
            updateStatus={updateMonitor.status}
            onOpenUpdates={() => {
              navigate({ kind: "settings", tab: "updates" });
            }}
            onCompose={() => openNew()}
            onFolderChange={(folder) => {
              navigate(
                folder === "settings"
                  ? { kind: "settings", tab: "mailboxes" }
                  : folder === "agents"
                    ? { kind: "agents" }
                    : folder === "contacts"
                      ? { kind: "contacts", contactId: null }
                      : folder === "drafts"
                        ? { kind: "drafts", draftId: null }
                        : { kind: "mail", folder, messageId: null }
              );
            }}
            onSettingsTabChange={(tab) => navigate({ kind: "settings", tab })}
            onMailboxChange={setMailboxId}
            onSearchChange={setSearchQuery}
            onSearchSelect={selectSearchResult}
            onSearchSubmit={submitSearch}
            onSignedOut={() => {
              setUser(null);
            }}
          >
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <WorkspacePages
                  activeFolder={activeFolder}
                  contentMailboxes={contentMailboxes}
                  deletedMailboxes={deletedMailboxes}
                  draftState={draftState}
                  labelIds={labelIds}
                  labels={labels}
                  mailboxId={mailboxId}
                  mailboxes={mailboxes}
                  mailSync={mailSync}
                  navigate={navigate}
                  route={route}
                  search={search}
                  settingsTab={settingsTab}
                  setup={setup}
                  updateMonitor={updateMonitor}
                  user={user}
                  users={users}
                  onCompose={(email) => openNew(email)}
                  onDefaultFromMailboxChange={(defaultFromMailboxId) => {
                    setUser((current) =>
                      current ? { ...current, defaultFromMailboxId } : current
                    );
                  }}
                  onLabelChange={setLabelIds}
                  onLabelsChanged={refreshLabels}
                  onReload={reload}
                />
              </div>
            </div>
          </AppShell>
        )}
      </ComposerHost>
      <Toaster />
    </>
  );
}

function FullScreenStatus({ label }: { label: string }): React.ReactElement {
  return (
    <main
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-rail text-sm text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className="size-5 rounded-full border-2 border-muted-foreground/20 border-t-foreground animate-spin"
      />
      <span className="sr-only">{label}</span>
    </main>
  );
}

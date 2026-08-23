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
import { DraftsPage } from "@/features/drafts/drafts-page";
import { useDrafts } from "@/features/drafts/use-drafts";
import { useMailEvents } from "@/features/events/use-mail-events";
import { InboxPage } from "@/features/inbox/inbox-page";
import { listMailboxes } from "@/features/mailboxes/api";
import type { Mailbox } from "@/features/mailboxes/types";
import { useMailSync } from "@/features/messages/use-mail-sync";
import { SettingsPage } from "@/features/settings/settings-page";
import { getSetupStatus } from "@/features/setup/api";
import { SetupPage } from "@/features/setup/setup-page";
import type { SetupStatus } from "@/features/setup/types";
import { useUpdateMonitor } from "@/features/updates/use-update-monitor";
import { listUsers } from "@/features/users/api";
import type { WorkspaceUser } from "@/features/users/types";
import {
  type FolderId,
  isPublicAuthenticationPath,
  type MailFolderId,
  type SettingsTabId
} from "@/lib/routes";
import { useAppRoute } from "@/lib/use-app-route";

const ComposeDialog = React.lazy(() =>
  import("@/features/compose/compose-dialog").then((module) => ({ default: module.ComposeDialog }))
);
const DraftComposeDialog = React.lazy(() =>
  import("@/features/drafts/draft-compose-dialog").then((module) => ({
    default: module.DraftComposeDialog
  }))
);

export function App(): React.ReactElement {
  const publicAuthenticationPath = isPublicAuthenticationPath(window.location.pathname);
  const [setup, setSetup] = React.useState<SetupStatus | null>(null);
  const [user, setUser] = React.useState<CurrentUser | null | undefined>(undefined);
  const [mailboxes, setMailboxes] = React.useState<Mailbox[]>([]);
  const [users, setUsers] = React.useState<WorkspaceUser[]>([]);
  const [mailboxId, setMailboxId] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const { navigate, route } = useAppRoute(setup?.isComplete);
  const activeFolder: FolderId =
    route.kind === "settings" ? "settings" : route.kind === "drafts" ? "drafts" : route.folder;
  const selectedId = route.kind === "mail" ? route.messageId : null;
  const selectedDraftId = route.kind === "drafts" ? route.draftId : null;
  const settingsTab: SettingsTabId = route.kind === "settings" ? route.tab : "mailboxes";
  const currentUserId = user?.passwordSetupRequired ? null : (user?.id ?? null);
  const draftState = useDrafts(currentUserId);
  const selectedDraft =
    selectedDraftId === null
      ? null
      : (draftState.drafts.find((draft) => draft.id === selectedDraftId) ?? null);
  const selectedDraftHasContext = Boolean(
    selectedDraft?.replyToMessageId ?? selectedDraft?.forwardOfMessageId
  );
  const contentMailboxes = React.useMemo(
    () => mailboxes.filter((mailbox) => mailbox.accessLevel !== null),
    [mailboxes]
  );
  const canManageUpdates =
    !user?.passwordSetupRequired && (user?.role === "owner" || user?.role === "admin");
  const updateMonitor = useUpdateMonitor(canManageUpdates);
  const mailSync = useMailSync({
    activeFolder,
    mailboxId,
    search,
    userId: currentUserId
  });

  const loadWorkspace = React.useCallback(async (currentUser: CurrentUser) => {
    const [nextSetup, nextMailboxes] = await Promise.all([getSetupStatus(), listMailboxes()]);
    setSetup(nextSetup);
    setMailboxes(nextMailboxes);

    if (currentUser.role === "owner" || currentUser.role === "admin") {
      setUsers(await listUsers());
    } else {
      setUsers([]);
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
  const refreshRealtimeState = React.useCallback(async () => {
    const results = await Promise.allSettled([
      refreshWorkspace(),
      mailSync.refresh(),
      draftState.refresh()
    ]);
    if (results.every((result) => result.status === "rejected")) {
      const failure = results.find((result) => result.status === "rejected");
      throw failure?.reason;
    }
  }, [draftState.refresh, mailSync.refresh, refreshWorkspace]);

  const connectionStatus = useMailEvents(currentUserId, {
    onDrafts: draftState.refresh,
    onFallbackPoll: refreshRealtimeState,
    onMailboxes: refreshRealtimeState,
    onMessages: mailSync.refresh,
    onReconnect: refreshRealtimeState
  });

  React.useEffect(() => {
    if (publicAuthenticationPath) return;
    void reload();
  }, [publicAuthenticationPath, reload]);

  React.useEffect(() => {
    if (!user || isLoading || route.kind !== "settings") return;
    const canManage = user.role === "owner" || user.role === "admin";
    const managementOnly = ["domains", "updates"].includes(route.tab);
    if (!canManage && managementOnly) {
      navigate({ kind: "settings", tab: "mailboxes" }, true);
    }
  }, [isLoading, navigate, route, user]);

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
      <AppShell
        activeFolder={activeFolder}
        activeSettingsTab={settingsTab}
        canManage={user.role === "owner" || user.role === "admin"}
        connectionStatus={connectionStatus}
        draftCount={draftState.drafts.length}
        mailboxId={mailboxId}
        mailboxes={contentMailboxes}
        unread={mailSync.notifications.unread}
        search={search}
        user={user}
        updateInProgress={updateMonitor.progress !== null}
        updateReady={updateMonitor.ready}
        updateStatus={updateMonitor.status}
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
              : folder === "drafts"
                ? { kind: "drafts", draftId: null }
                : { kind: "mail", folder, messageId: null }
          );
        }}
        onSettingsTabChange={(tab) => navigate({ kind: "settings", tab })}
        onMailboxChange={setMailboxId}
        onSearchChange={setSearch}
        onSignedOut={() => {
          setUser(null);
        }}
      >
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            {activeFolder === "settings" ? (
              <SettingsPage
                activeTab={settingsTab}
                canManage={user.role === "owner" || user.role === "admin"}
                currentUser={user}
                defaultFromMailboxId={user.defaultFromMailboxId}
                mailboxes={mailboxes}
                notifications={mailSync.notifications}
                setup={setup}
                users={users}
                onDefaultFromMailboxChange={(defaultFromMailboxId) => {
                  setUser((current) => (current ? { ...current, defaultFromMailboxId } : current));
                }}
                onRefresh={reload}
                onUpdateStarted={updateMonitor.start}
                onUpdateStatusChange={updateMonitor.acceptStatus}
                updateProgress={updateMonitor.progress}
                updateStatus={updateMonitor.status}
              />
            ) : activeFolder === "drafts" && selectedDraft && selectedDraftHasContext ? (
              <React.Suspense
                fallback={
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">
                    Opening draft…
                  </div>
                }
              >
                <DraftComposeDialog
                  draft={selectedDraft}
                  mailboxes={contentMailboxes}
                  onDraftsChange={() => void draftState.refresh().catch(() => undefined)}
                  onOpenChange={(open) => {
                    if (!open) navigate({ kind: "drafts", draftId: null });
                  }}
                  onSent={() => void mailSync.refresh().catch(() => undefined)}
                />
              </React.Suspense>
            ) : activeFolder === "drafts" ? (
              <DraftsPage
                drafts={draftState.drafts}
                isLoading={draftState.isLoading}
                mailboxId={mailboxId}
                search={search}
                selectedId={selectedDraftId}
                onBack={() => navigate({ kind: "drafts", draftId: null })}
                onSelect={(draftId) => navigate({ kind: "drafts", draftId })}
              />
            ) : (
              <InboxPage
                activeFolder={activeFolder as MailFolderId}
                conversations={mailSync.conversations}
                defaultFromMailboxId={user.defaultFromMailboxId}
                hasMore={mailSync.hasMore}
                isLoadingMore={mailSync.isLoadingMore}
                loadMoreError={mailSync.loadMoreError}
                mailboxes={contentMailboxes}
                selectedId={selectedId}
                onDraftsChange={() => void draftState.refresh().catch(() => undefined)}
                onConversationAction={mailSync.applyConversationAction}
                onLoadMore={() => void mailSync.loadMore()}
                onRefresh={() => mailSync.refresh()}
                onMessageRouteChange={(folder, messageId) =>
                  navigate({ kind: "mail", folder, messageId })
                }
                onSelect={(messageId) =>
                  navigate({ kind: "mail", folder: activeFolder as MailFolderId, messageId })
                }
                totalCount={mailSync.totalCount}
              />
            )}
          </div>
        </div>
      </AppShell>
      {composeOpen ? (
        <React.Suspense fallback={null}>
          <ComposeDialog
            defaultFromMailboxId={user.defaultFromMailboxId}
            mailboxes={contentMailboxes}
            mode="new"
            open={composeOpen}
            onOpenChange={setComposeOpen}
            onDraftsChange={() => void draftState.refresh().catch(() => undefined)}
            onSent={() => void mailSync.refresh().catch(() => undefined)}
          />
        </React.Suspense>
      ) : null}
      {selectedDraft && !selectedDraftHasContext ? (
        <React.Suspense fallback={null}>
          <DraftComposeDialog
            draft={selectedDraft}
            mailboxes={contentMailboxes}
            onDraftsChange={() => void draftState.refresh().catch(() => undefined)}
            onOpenChange={(open) => {
              if (!open) navigate({ kind: "drafts", draftId: null });
            }}
            onSent={() => void mailSync.refresh().catch(() => undefined)}
          />
        </React.Suspense>
      ) : null}
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

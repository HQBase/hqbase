import * as React from "react";

import { AgentsPage } from "@/features/agents/agents-page";
import type { CurrentUser } from "@/features/auth/types";
import { ContactsPage } from "@/features/contacts/contacts-page";
import { DraftsPage } from "@/features/drafts/drafts-page";
import type { useDrafts } from "@/features/drafts/use-drafts";
import { InboxPage } from "@/features/inbox/inbox-page";
import type { MailLabel } from "@/features/labels/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { useMailSync } from "@/features/messages/use-mail-sync";
import { SettingsPage } from "@/features/settings/settings-page";
import type { SetupStatus } from "@/features/setup/types";
import type { useUpdateMonitor } from "@/features/updates/use-update-monitor";
import type { WorkspaceUser } from "@/features/users/types";
import type { AppRoute, FolderId, MailFolderId, SettingsTabId } from "@/lib/routes";
import type { useAppRoute } from "@/lib/use-app-route";

const DraftComposeDialog = React.lazy(() =>
  import("@/features/drafts/draft-compose-dialog").then((module) => ({
    default: module.DraftComposeDialog
  }))
);

type WorkspacePagesProps = {
  activeFolder: FolderId;
  contentMailboxes: Mailbox[];
  deletedMailboxes: Mailbox[];
  draftState: ReturnType<typeof useDrafts>;
  labelIds: readonly string[];
  labels: MailLabel[];
  mailboxId: string;
  mailboxes: Mailbox[];
  mailSync: ReturnType<typeof useMailSync>;
  navigate: ReturnType<typeof useAppRoute>["navigate"];
  route: AppRoute;
  search: string;
  settingsTab: SettingsTabId;
  setup: SetupStatus;
  updateMonitor: ReturnType<typeof useUpdateMonitor>;
  user: CurrentUser;
  users: WorkspaceUser[];
  onCompose: (email: string) => void;
  onDefaultFromMailboxChange: (mailboxId: string | null) => void;
  onLabelsChanged: () => Promise<void>;
  onReload: () => Promise<void>;
  onLabelChange: (labelIds: string[]) => void;
};

export function WorkspacePages({
  activeFolder,
  contentMailboxes,
  deletedMailboxes,
  draftState,
  labelIds,
  labels,
  mailboxId,
  mailboxes,
  mailSync,
  navigate,
  route,
  search,
  settingsTab,
  setup,
  updateMonitor,
  user,
  users,
  onCompose,
  onDefaultFromMailboxChange,
  onLabelsChanged,
  onReload,
  onLabelChange
}: WorkspacePagesProps): React.ReactElement {
  const selectedContactId = route.kind === "contacts" ? route.contactId : null;
  const selectedDraftId = route.kind === "drafts" ? route.draftId : null;
  const selectedId = route.kind === "mail" ? route.messageId : null;
  const selectedDraft =
    selectedDraftId === null
      ? null
      : (draftState.drafts.find((draft) => draft.id === selectedDraftId) ?? null);
  const selectedDraftHasContext = Boolean(
    selectedDraft?.replyToMessageId ?? selectedDraft?.forwardOfMessageId
  );
  const draftsChanged = () => void draftState.refresh().catch(() => undefined);
  const sent = () => void mailSync.refresh().catch(() => undefined);

  return (
    <>
      {activeFolder === "agents" ? (
        <AgentsPage
          canManage={user.role === "owner" || user.role === "admin"}
          domains={setup.domains}
          mailboxes={mailboxes}
          user={user}
          onChanged={onReload}
        />
      ) : activeFolder === "contacts" ? (
        <ContactsPage
          selectedId={selectedContactId}
          onBack={() => navigate({ kind: "contacts", contactId: null })}
          onCompose={onCompose}
          onOpenConversation={(conversation) =>
            navigate({
              kind: "mail",
              folder: conversation.folder,
              messageId: conversation.id
            })
          }
          onSelect={(contactId) => navigate({ kind: "contacts", contactId })}
        />
      ) : activeFolder === "settings" ? (
        <SettingsPage
          activeTab={settingsTab}
          canManage={user.role === "owner" || user.role === "admin"}
          currentUser={user}
          defaultFromMailboxId={user.defaultFromMailboxId}
          deletedMailboxes={deletedMailboxes}
          labels={labels}
          mailboxes={mailboxes}
          notifications={mailSync.notifications}
          setup={setup}
          users={users}
          onDefaultFromMailboxChange={onDefaultFromMailboxChange}
          onLabelsChanged={onLabelsChanged}
          onRefresh={onReload}
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
            onDraftsChange={draftsChanged}
            onOpenChange={(open) => {
              if (!open) navigate({ kind: "drafts", draftId: null });
            }}
            onSent={sent}
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
          labelIds={labelIds}
          labels={labels}
          loadMoreError={mailSync.loadMoreError}
          mailboxes={contentMailboxes}
          selectedId={selectedId}
          totalCount={mailSync.totalCount}
          canOrganizeConversation={(mailboxId) =>
            user.role === "owner" ||
            contentMailboxes.some(
              (mailbox) =>
                mailbox.id === mailboxId &&
                (mailbox.accessLevel === "agent" || mailbox.accessLevel === "manager")
            )
          }
          onConversationAction={mailSync.applyConversationAction}
          onConversationLabelsChange={mailSync.applyConversationLabels}
          onDraftsChange={draftsChanged}
          onLabelChange={onLabelChange}
          onLoadMore={() => void mailSync.loadMore()}
          onMessageRouteChange={(folder, messageId) =>
            navigate({ kind: "mail", folder, messageId })
          }
          onRefresh={() => mailSync.refresh()}
          onSelect={(messageId) =>
            navigate({ kind: "mail", folder: activeFolder as MailFolderId, messageId })
          }
        />
      )}

      {selectedDraft && !selectedDraftHasContext ? (
        <React.Suspense fallback={null}>
          <DraftComposeDialog
            draft={selectedDraft}
            mailboxes={contentMailboxes}
            onDraftsChange={draftsChanged}
            onOpenChange={(open) => {
              if (!open) navigate({ kind: "drafts", draftId: null });
            }}
            onSent={sent}
          />
        </React.Suspense>
      ) : null}
    </>
  );
}

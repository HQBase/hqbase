import type * as React from "react";
import type { CurrentUser } from "@/features/auth/types";
import { DomainSettings } from "@/features/domains/domain-settings";
import { LabelSettings } from "@/features/labels/label-settings";
import type { MailLabel } from "@/features/labels/types";
import { MailboxSettings } from "@/features/mailboxes/mailbox-settings";
import type { Mailbox } from "@/features/mailboxes/types";
import { NotificationSettings } from "@/features/notifications/notification-settings";
import type { NotificationController } from "@/features/notifications/types";
import { InterfaceSettings } from "@/features/settings/interface-settings";
import type { SetupStatus } from "@/features/setup/types";
import { SignatureSettings } from "@/features/signatures/signature-settings";
import type { UpdateStatus } from "@/features/updates/types";
import type { UpdateActionKind, UpdateProgress } from "@/features/updates/update-progress";
import { UpdateSettings } from "@/features/updates/update-settings";
import type { WorkspaceUser } from "@/features/users/types";
import { UserSettings } from "@/features/users/user-settings";
import type { SettingsTabId } from "@/lib/routes";

type SettingsPageProps = {
  activeTab: SettingsTabId;
  canManage: boolean;
  currentUser: CurrentUser;
  defaultFromMailboxId: string | null;
  deletedMailboxes: Mailbox[];
  mailboxes: Mailbox[];
  labels?: MailLabel[];
  notifications: NotificationController;
  setup: SetupStatus;
  users: WorkspaceUser[];
  onDefaultFromMailboxChange: (mailboxId: string) => void;
  onRefresh: () => Promise<void>;
  onLabelsChanged?: () => Promise<void>;
  onUpdateStarted: (buildId: string, kind: UpdateActionKind) => void;
  onUpdateStatusChange: (status: UpdateStatus) => void;
  updateProgress: UpdateProgress | null;
  updateStatus: UpdateStatus | null;
};

export function SettingsPage({
  activeTab,
  canManage,
  currentUser,
  defaultFromMailboxId,
  deletedMailboxes,
  mailboxes,
  labels = [],
  notifications,
  setup,
  users,
  onDefaultFromMailboxChange,
  onRefresh,
  onLabelsChanged = () => Promise.resolve(),
  onUpdateStarted,
  onUpdateStatusChange,
  updateProgress,
  updateStatus
}: SettingsPageProps): React.ReactElement {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {activeTab === "mailboxes" ? (
          <MailboxSettings
            canManage={canManage}
            defaultFromMailboxId={defaultFromMailboxId}
            deletedMailboxes={deletedMailboxes}
            domains={setup.domains}
            mailboxes={mailboxes}
            users={users}
            onDefaultFromMailboxChange={onDefaultFromMailboxChange}
            onChanged={onRefresh}
          />
        ) : null}
        {activeTab === "users" && canManage ? (
          <UserSettings
            currentUser={currentUser}
            managedDomains={setup.domains.map((domain) => domain.name)}
            users={users}
            onChanged={onRefresh}
          />
        ) : null}
        {activeTab === "domains" && canManage ? (
          <DomainSettings
            mailboxes={mailboxes}
            portalHostname={setup.portalHostname}
            onChanged={onRefresh}
          />
        ) : null}
        {activeTab === "preferences" ? (
          <div className="flex flex-col gap-10">
            <InterfaceSettings />
            <NotificationSettings notifications={notifications} />
          </div>
        ) : null}
        {activeTab === "labels" ? (
          <LabelSettings canManage={canManage} labels={labels} onChanged={onLabelsChanged} />
        ) : null}
        {activeTab === "signatures" ? (
          <SignatureSettings domains={setup.domains} mailboxes={mailboxes} user={currentUser} />
        ) : null}
        {activeTab === "updates" && canManage ? (
          <UpdateSettings
            initialStatus={updateStatus}
            progress={updateProgress}
            onStatusChange={onUpdateStatusChange}
            onUpdateStarted={onUpdateStarted}
          />
        ) : null}
      </div>
    </div>
  );
}

import type * as React from "react";
import { AgentSettings } from "@/features/agents/agent-settings";
import type { CurrentUser } from "@/features/auth/types";
import { DomainSettings } from "@/features/domains/domain-settings";
import { MailboxSettings } from "@/features/mailboxes/mailbox-settings";
import type { Mailbox } from "@/features/mailboxes/types";
import { McpSettings } from "@/features/mcp/mcp-settings";
import { NotificationSettings } from "@/features/notifications/notification-settings";
import type { NotificationController } from "@/features/notifications/types";
import { DebugSettings } from "@/features/settings/debug-settings";
import { InterfaceSettings } from "@/features/settings/interface-settings";
import { SettingsSection } from "@/features/settings/settings-section";
import type { SetupStatus } from "@/features/setup/types";
import type { UpdateStatus } from "@/features/updates/types";
import type { UpdateProgress } from "@/features/updates/update-progress";
import { UpdateSettings } from "@/features/updates/update-settings";
import type { WorkspaceUser } from "@/features/users/types";
import { UserSettings } from "@/features/users/user-settings";
import type { SettingsTabId } from "@/lib/routes";

type SettingsPageProps = {
  activeTab: SettingsTabId;
  canManage: boolean;
  currentUser: CurrentUser;
  defaultFromMailboxId: string | null;
  mailboxes: Mailbox[];
  notifications: NotificationController;
  setup: SetupStatus;
  users: WorkspaceUser[];
  onDefaultFromMailboxChange: (mailboxId: string) => void;
  onRefresh: () => Promise<void>;
  onUpdateStarted: (buildId: string) => void;
  onUpdateStatusChange: (status: UpdateStatus) => void;
  updateProgress: UpdateProgress | null;
  updateStatus: UpdateStatus | null;
};

export function SettingsPage({
  activeTab,
  canManage,
  currentUser,
  defaultFromMailboxId,
  mailboxes,
  notifications,
  setup,
  users,
  onDefaultFromMailboxChange,
  onRefresh,
  onUpdateStarted,
  onUpdateStatusChange,
  updateProgress,
  updateStatus
}: SettingsPageProps): React.ReactElement {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === "mailboxes" ? (
          <MailboxSettings
            canManage={canManage}
            defaultFromMailboxId={defaultFromMailboxId}
            mailboxes={mailboxes}
            users={users}
            onDefaultFromMailboxChange={onDefaultFromMailboxChange}
            onChanged={onRefresh}
          />
        ) : null}
        {activeTab === "agents" && canManage ? (
          <AgentSettings domains={setup.domains} mailboxes={mailboxes} onChanged={onRefresh} />
        ) : null}
        {activeTab === "users" ? (
          canManage ? (
            <UserSettings
              managedDomains={setup.domains.map((domain) => domain.name)}
              users={users}
              onChanged={onRefresh}
            />
          ) : (
            <NoUserAccess />
          )
        ) : null}
        {activeTab === "domains" && canManage ? (
          <DomainSettings portalHostname={setup.portalHostname} onChanged={onRefresh} />
        ) : null}
        {activeTab === "notifications" ? (
          <NotificationSettings notifications={notifications} />
        ) : null}
        {activeTab === "interface" ? <InterfaceSettings /> : null}
        {activeTab === "mcp" ? <McpSettings user={currentUser} /> : null}
        {activeTab === "updates" && canManage ? (
          <UpdateSettings
            initialStatus={updateStatus}
            progress={updateProgress}
            onStatusChange={onUpdateStatusChange}
            onUpdateStarted={onUpdateStarted}
          />
        ) : null}
        {activeTab === "debug" ? <DebugSettings setup={setup} /> : null}
      </div>
    </div>
  );
}

function NoUserAccess(): React.ReactElement {
  return (
    <SettingsSection
      description="Only owner and admin users can manage workspace users."
      title="Users"
    >
      <p className="text-sm text-muted-foreground">
        You can still read and send shared workspace email.
      </p>
    </SettingsSection>
  );
}

import type * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DomainSettings } from "@/features/domains/domain-settings";
import { MailboxSettings } from "@/features/mailboxes/mailbox-settings";
import type { Mailbox } from "@/features/mailboxes/types";
import { NotificationSettings } from "@/features/notifications/notification-settings";
import type { NotificationController } from "@/features/notifications/types";
import { DebugSettings } from "@/features/settings/debug-settings";
import { SettingsSection } from "@/features/settings/settings-section";
import type { SetupStatus } from "@/features/setup/types";
import type { UpdateStatus } from "@/features/updates/types";
import type { UpdateProgress } from "@/features/updates/update-progress";
import { UpdateSettings } from "@/features/updates/update-settings";
import type { WorkspaceUser } from "@/features/users/types";
import { UserSettings } from "@/features/users/user-settings";
import { appRoutePath, isSettingsTabId, type SettingsTabId } from "@/lib/routes";

type SettingsPageProps = {
  activeTab: SettingsTabId;
  canManage: boolean;
  defaultFromMailboxId: string | null;
  mailboxes: Mailbox[];
  notifications: NotificationController;
  setup: SetupStatus;
  users: WorkspaceUser[];
  onDefaultFromMailboxChange: (mailboxId: string) => void;
  onRefresh: () => void;
  onTabChange: (tab: SettingsTabId) => void;
  onUpdateStarted: (buildId: string) => void;
  onUpdateStatusChange: (status: UpdateStatus) => void;
  updateProgress: UpdateProgress | null;
  updateStatus: UpdateStatus | null;
};

export function SettingsPage({
  activeTab,
  canManage,
  defaultFromMailboxId,
  mailboxes,
  notifications,
  setup,
  users,
  onDefaultFromMailboxChange,
  onRefresh,
  onTabChange,
  onUpdateStarted,
  onUpdateStatusChange,
  updateProgress,
  updateStatus
}: SettingsPageProps): React.ReactElement {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-7">
          <h1 className="text-xl font-medium tracking-tight">Settings</h1>
          <p className="mt-1 text-xs text-muted-foreground">Workspace and access</p>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (isSettingsTabId(value)) onTabChange(value);
          }}
        >
          <TabsList className="h-auto w-full flex-wrap justify-start gap-x-1 rounded-none border-b bg-transparent p-0">
            <SettingsTab value="mailboxes">Mailboxes</SettingsTab>
            <SettingsTab value="users">Users</SettingsTab>
            {canManage ? <SettingsTab value="domains">Domains</SettingsTab> : null}
            <SettingsTab value="notifications">Notifications</SettingsTab>
            {canManage ? <SettingsTab value="updates">Updates</SettingsTab> : null}
            <SettingsTab value="debug">Debug</SettingsTab>
          </TabsList>
          <TabsContent className="mt-5" value="mailboxes">
            <MailboxSettings
              canManage={canManage}
              defaultFromMailboxId={defaultFromMailboxId}
              mailboxes={mailboxes}
              users={users}
              onDefaultFromMailboxChange={onDefaultFromMailboxChange}
              onChanged={onRefresh}
            />
          </TabsContent>
          <TabsContent className="mt-5" value="users">
            {canManage ? (
              <UserSettings
                managedDomains={setup.domains.map((domain) => domain.name)}
                users={users}
                onChanged={onRefresh}
              />
            ) : (
              <NoUserAccess />
            )}
          </TabsContent>
          {canManage ? (
            <TabsContent className="mt-5" value="domains">
              <DomainSettings portalHostname={setup.portalHostname} onChanged={onRefresh} />
            </TabsContent>
          ) : null}
          <TabsContent className="mt-5" value="notifications">
            <NotificationSettings notifications={notifications} />
          </TabsContent>
          {canManage ? (
            <TabsContent className="mt-5" value="updates">
              <UpdateSettings
                initialStatus={updateStatus}
                progress={updateProgress}
                onStatusChange={onUpdateStatusChange}
                onUpdateStarted={onUpdateStarted}
              />
            </TabsContent>
          ) : null}
          <TabsContent className="mt-5" value="debug">
            <DebugSettings setup={setup} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SettingsTab({
  children,
  value
}: {
  children: React.ReactNode;
  value: SettingsTabId;
}): React.ReactElement {
  return (
    <TabsTrigger
      asChild
      className="rounded-none border-b border-transparent px-3 py-2 text-xs font-normal text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
      value={value}
    >
      <a
        href={appRoutePath({ kind: "settings", tab: value })}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
        }}
      >
        {children}
      </a>
    </TabsTrigger>
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

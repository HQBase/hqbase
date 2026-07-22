import type * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillingSettings } from "@/features/billing/billing-settings";
import type { EntitlementStatus } from "@/features/billing/types";
import { DomainSettings } from "@/features/domains/domain-settings";
import { MailboxSettings } from "@/features/mailboxes/mailbox-settings";
import type { Mailbox } from "@/features/mailboxes/types";
import { DebugSettings } from "@/features/settings/debug-settings";
import { SettingsSection } from "@/features/settings/settings-section";
import type { SetupStatus } from "@/features/setup/types";
import type { UpdateStatus } from "@/features/updates/types";
import { UpdateSettings } from "@/features/updates/update-settings";
import type { UpgradeLifecycle } from "@/features/upgrades/types";
import type { WorkspaceUser } from "@/features/users/types";
import { UserSettings } from "@/features/users/user-settings";
import { appRoutePath, isSettingsTabId, type SettingsTabId } from "@/lib/routes";

type SettingsPageProps = {
  activeTab: SettingsTabId;
  canManage: boolean;
  mailboxes: Mailbox[];
  setup: SetupStatus;
  users: WorkspaceUser[];
  entitlement: EntitlementStatus | null;
  upgrade: UpgradeLifecycle | null;
  onEntitlementChanged: (status: EntitlementStatus) => void;
  onUpgradeChanged: (upgrade: UpgradeLifecycle) => void;
  onRefresh: () => void;
  onTabChange: (tab: SettingsTabId) => void;
  updateStatus: UpdateStatus | null;
};

export function SettingsPage({
  activeTab,
  canManage,
  mailboxes,
  setup,
  users,
  entitlement,
  upgrade,
  onEntitlementChanged,
  onUpgradeChanged,
  onRefresh,
  onTabChange,
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
            {canManage && entitlement ? <SettingsTab value="billing">Billing</SettingsTab> : null}
            {canManage ? <SettingsTab value="updates">Updates</SettingsTab> : null}
            <SettingsTab value="debug">Debug</SettingsTab>
          </TabsList>
          <TabsContent className="mt-5" value="mailboxes">
            <MailboxSettings
              canManage={canManage}
              mailboxes={mailboxes}
              users={users}
              onChanged={onRefresh}
            />
          </TabsContent>
          <TabsContent className="mt-5" value="users">
            {canManage ? <UserSettings users={users} onChanged={onRefresh} /> : <NoUserAccess />}
          </TabsContent>
          {canManage ? (
            <TabsContent className="mt-5" value="domains">
              <DomainSettings portalHostname={setup.portalHostname} onChanged={onRefresh} />
            </TabsContent>
          ) : null}
          {canManage && entitlement ? (
            <TabsContent className="mt-5" value="billing">
              <BillingSettings status={entitlement} onChanged={onEntitlementChanged} />
            </TabsContent>
          ) : null}
          {canManage ? (
            <TabsContent className="mt-5" value="updates">
              <UpdateSettings initialStatus={updateStatus} />
            </TabsContent>
          ) : null}
          <TabsContent className="mt-5" value="debug">
            <DebugSettings
              entitlement={canManage ? entitlement : null}
              setup={setup}
              upgrade={canManage ? upgrade : null}
              onUpgradeChanged={onUpgradeChanged}
            />
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

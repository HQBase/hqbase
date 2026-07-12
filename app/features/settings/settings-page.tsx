import type * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppPasswordSettings } from "@/features/app-passwords/app-password-settings";
import { BillingSettings } from "@/features/billing/billing-settings";
import type { EntitlementStatus } from "@/features/billing/types";
import { DomainSettings } from "@/features/domains/domain-settings";
import { MailboxAccessSettings } from "@/features/mailbox-access/mailbox-access-settings";
import { MailboxSettings } from "@/features/mailboxes/mailbox-settings";
import type { Mailbox } from "@/features/mailboxes/types";
import { GeneralSettings } from "@/features/settings/general-settings";
import type { SetupStatus } from "@/features/setup/types";
import type { UpgradeLifecycle } from "@/features/upgrades/types";
import { UpgradeSettings } from "@/features/upgrades/upgrade-settings";
import type { WorkspaceUser } from "@/features/users/types";
import { UserSettings } from "@/features/users/user-settings";

type SettingsPageProps = {
  canManage: boolean;
  mailboxes: Mailbox[];
  setup: SetupStatus;
  users: WorkspaceUser[];
  entitlement: EntitlementStatus | null;
  upgrade: UpgradeLifecycle | null;
  onEntitlementChanged: (status: EntitlementStatus) => void;
  onUpgradeChanged: (upgrade: UpgradeLifecycle) => void;
  onRefresh: () => void;
};

export function SettingsPage({
  canManage,
  mailboxes,
  setup,
  users,
  entitlement,
  upgrade,
  onEntitlementChanged,
  onUpgradeChanged,
  onRefresh
}: SettingsPageProps): React.ReactElement {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-7">
          <h1 className="text-xl font-medium tracking-tight">Settings</h1>
          <p className="mt-1 text-xs text-muted-foreground">Workspace and access</p>
        </div>
        <Tabs defaultValue="mailboxes">
          <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
            <SettingsTab value="mailboxes">Mailboxes</SettingsTab>
            <SettingsTab value="users">Users</SettingsTab>
            {canManage ? <SettingsTab value="domains">Domains</SettingsTab> : null}
            {canManage ? <SettingsTab value="access">Access</SettingsTab> : null}
            <SettingsTab value="mail-clients">Mail clients</SettingsTab>
            {canManage && entitlement ? <SettingsTab value="billing">Billing</SettingsTab> : null}
            {canManage && entitlement && upgrade ? (
              <SettingsTab value="upgrade">Upgrade</SettingsTab>
            ) : null}
            <SettingsTab value="general">General</SettingsTab>
          </TabsList>
          <TabsContent className="mt-5" value="mailboxes">
            <MailboxSettings canManage={canManage} mailboxes={mailboxes} onChanged={onRefresh} />
          </TabsContent>
          <TabsContent className="mt-5" value="users">
            {canManage ? <UserSettings users={users} onChanged={onRefresh} /> : <NoUserAccess />}
          </TabsContent>
          {canManage ? (
            <TabsContent className="mt-5" value="domains">
              <DomainSettings portalHostname={setup.portalHostname} onChanged={onRefresh} />
            </TabsContent>
          ) : null}
          {canManage ? (
            <TabsContent className="mt-5" value="access">
              <MailboxAccessSettings mailboxes={mailboxes} users={users} />
            </TabsContent>
          ) : null}
          <TabsContent className="mt-5" value="general">
            <GeneralSettings setup={setup} />
          </TabsContent>
          <TabsContent className="mt-5" value="mail-clients">
            <AppPasswordSettings />
          </TabsContent>
          {canManage && entitlement ? (
            <TabsContent className="mt-5" value="billing">
              <BillingSettings status={entitlement} onChanged={onEntitlementChanged} />
            </TabsContent>
          ) : null}
          {canManage && entitlement && upgrade ? (
            <TabsContent className="mt-5" value="upgrade">
              <UpgradeSettings
                entitlement={entitlement}
                lifecycle={upgrade}
                onChanged={onUpgradeChanged}
              />
            </TabsContent>
          ) : null}
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
  value: string;
}): React.ReactElement {
  return (
    <TabsTrigger
      className="rounded-none border-b border-transparent px-3 py-2 text-xs font-normal text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
      value={value}
    >
      {children}
    </TabsTrigger>
  );
}

function NoUserAccess(): React.ReactElement {
  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Only owner and admin users can manage workspace users.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        You can still read and send shared workspace email.
      </CardContent>
    </Card>
  );
}

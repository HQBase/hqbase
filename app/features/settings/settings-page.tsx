import type * as React from "react";

import { ProUpgradeCard } from "@/components/pro-upgrade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MailboxSettings } from "@/features/mailboxes/mailbox-settings";
import type { Mailbox } from "@/features/mailboxes/types";
import { GeneralSettings } from "@/features/settings/general-settings";
import type { SetupStatus } from "@/features/setup/types";
import type { UpdateStatus } from "@/features/updates/types";
import { UpdateSettings } from "@/features/updates/update-settings";
import type { WorkspaceUser } from "@/features/users/types";
import { UserSettings } from "@/features/users/user-settings";

type SettingsPageProps = {
  canManage: boolean;
  mailboxes: Mailbox[];
  setup: SetupStatus;
  users: WorkspaceUser[];
  onRefresh: () => void;
  defaultTab?: string;
  updateStatus: UpdateStatus | null;
};

export function SettingsPage({
  canManage,
  mailboxes,
  setup,
  users,
  onRefresh,
  defaultTab = "mailboxes",
  updateStatus
}: SettingsPageProps): React.ReactElement {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-7">
          <h1 className="text-xl font-medium tracking-tight">Settings</h1>
          <p className="mt-1 text-xs text-muted-foreground">Workspace and access</p>
        </div>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
            <SettingsTab value="mailboxes">Mailboxes</SettingsTab>
            <SettingsTab value="users">Users</SettingsTab>
            {canManage ? <SettingsTab value="mail-clients">Mail clients</SettingsTab> : null}
            <SettingsTab value="general">General</SettingsTab>
            {canManage ? <SettingsTab value="updates">Updates</SettingsTab> : null}
          </TabsList>
          <TabsContent className="mt-5" value="mailboxes">
            <MailboxSettings canManage={canManage} mailboxes={mailboxes} onChanged={onRefresh} />
          </TabsContent>
          <TabsContent className="mt-5" value="users">
            {canManage ? <UserSettings users={users} onChanged={onRefresh} /> : <NoUserAccess />}
          </TabsContent>
          {canManage ? (
            <TabsContent className="mt-5" value="mail-clients">
              <ProUpgradeCard
                description="Use Apple Mail, Thunderbird, Outlook, and other standard clients through secure IMAP and SMTP app passwords."
                placement="mail-clients"
                title="Bring the shared workspace to your email client."
              />
            </TabsContent>
          ) : null}
          <TabsContent className="mt-5" value="general">
            <GeneralSettings setup={setup} />
          </TabsContent>
          {canManage ? (
            <TabsContent className="mt-5" value="updates">
              <UpdateSettings initialStatus={updateStatus} />
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

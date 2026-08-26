import type * as React from "react";
import type { CurrentUser } from "@/features/auth/types";
import { ConnectedAppsPage } from "@/features/connected-apps/connected-apps-page";
import type { Mailbox } from "@/features/mailboxes/types";
import type { AgentTabId } from "@/lib/routes";
import { AgentSettings } from "./agent-settings";

export function AgentsPage({
  activeTab,
  canManage,
  domains,
  mailboxes,
  user,
  onChanged
}: {
  activeTab: AgentTabId;
  canManage: boolean;
  domains: Array<{ id: string; name: string; isEnabled: boolean }>;
  mailboxes: Mailbox[];
  user: CurrentUser;
  onChanged: () => Promise<void>;
}): React.ReactElement {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {activeTab === "connections" ? <ConnectedAppsPage user={user} /> : null}
        {activeTab === "mailboxes" && canManage ? (
          <AgentSettings
            domains={domains}
            mailboxes={mailboxes}
            profile="mailbox"
            onChanged={onChanged}
          />
        ) : null}
        {activeTab === "provisioning" && canManage ? (
          <AgentSettings
            domains={domains}
            mailboxes={mailboxes}
            profile="provisioner"
            onChanged={onChanged}
          />
        ) : null}
      </div>
    </div>
  );
}

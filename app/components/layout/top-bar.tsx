import type * as React from "react";
import { PiMagnifyingGlass, PiSidebarSimple } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { CurrentUser } from "@/features/auth/types";
import type { MailConnectionStatus } from "@/features/events/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
import { mailboxUnreadLabel } from "@/features/notifications/unread";
import type { FolderId, SettingsTabId } from "@/lib/routes";
import { MobileNavigation } from "./mobile-navigation";

type TopBarProps = {
  activeFolder: FolderId;
  activeSettingsTab?: SettingsTabId | undefined;
  canManage?: boolean | undefined;
  connectionStatus?: MailConnectionStatus | undefined;
  draftCount: number;
  user: CurrentUser;
  mailboxes: Mailbox[];
  mailboxId: string;
  search: string;
  unread: UnreadCounts;
  onCompose: () => void;
  onFolderChange: (folder: FolderId) => void;
  onMailboxChange: (mailboxId: string) => void;
  onSearchChange: (search: string) => void;
  onSettingsTabChange?: ((tab: SettingsTabId) => void) | undefined;
  onSignedOut: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
};

export function TopBar({
  activeFolder,
  activeSettingsTab,
  canManage,
  connectionStatus,
  draftCount,
  user,
  mailboxes,
  mailboxId,
  search,
  unread,
  onCompose,
  onFolderChange,
  onMailboxChange,
  onSearchChange,
  onSettingsTabChange,
  onSignedOut,
  sidebarCollapsed,
  onToggleSidebar
}: TopBarProps): React.ReactElement {
  return (
    <header className="flex h-12 w-full shrink-0 touch-none items-center gap-2 border-b border-divider bg-toolbar px-3 lg:px-4">
      {sidebarCollapsed && onToggleSidebar ? (
        <Button
          aria-label="Show sidebar"
          className="size-9 shrink-0 text-muted-foreground"
          onClick={onToggleSidebar}
          size="icon"
          title="Show sidebar"
          type="button"
          variant="ghost"
        >
          <PiSidebarSimple />
        </Button>
      ) : null}
      <MobileNavigation
        activeFolder={activeFolder}
        activeSettingsTab={activeSettingsTab}
        canManage={canManage}
        connectionStatus={connectionStatus}
        draftCount={draftCount}
        mailboxId={mailboxId}
        mailboxes={mailboxes}
        unread={unread}
        user={user}
        onCompose={onCompose}
        onFolderChange={onFolderChange}
        onMailboxChange={onMailboxChange}
        onSettingsTabChange={onSettingsTabChange}
        onSignedOut={onSignedOut}
      />
      <div className="relative min-w-0 max-w-xl flex-1">
        <PiMagnifyingGlass
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search mail"
          className="h-8 border-transparent bg-muted/70 pl-8 text-xs shadow-none focus-visible:border-input focus-visible:ring-1"
          placeholder="Search mail"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Select value={mailboxId} onValueChange={onMailboxChange}>
          <SelectTrigger
            aria-label="Mailbox filter"
            className="hidden h-8 w-52 border-transparent bg-muted/70 shadow-none lg:flex"
          >
            <SelectValue placeholder="All mailboxes" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">
                {mailboxUnreadLabel("All mailboxes", "all", unread)}
              </SelectItem>
              {mailboxes.map((mailbox) => (
                <SelectItem key={mailbox.id} value={mailbox.id}>
                  {mailboxUnreadLabel(mailbox.address, mailbox.id, unread)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}

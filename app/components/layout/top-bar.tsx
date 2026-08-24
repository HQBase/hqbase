import type * as React from "react";
import { PiCaretDown, PiMagnifyingGlass, PiRobot, PiSidebarSimple } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { CurrentUser } from "@/features/auth/types";
import type { MailConnectionStatus } from "@/features/events/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
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
  const humanMailboxes = mailboxes.filter((mailbox) => mailbox.kind === "human");
  const agentMailboxes = mailboxes.filter((mailbox) => mailbox.kind === "agent");
  const selectedMailbox = mailboxes.find((mailbox) => mailbox.id === mailboxId);
  const selectedMailboxLabel = selectedMailbox?.address ?? "All mailboxes";

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Mailbox filter"
              className="hidden h-8 min-h-0 w-52 justify-between bg-muted/70 px-2.5 font-normal shadow-none lg:flex"
              size="sm"
              type="button"
              variant="ghost"
            >
              <span className="truncate">{selectedMailboxLabel}</span>
              <PiCaretDown aria-hidden="true" data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" side="bottom">
            <DropdownMenuRadioGroup value={mailboxId} onValueChange={onMailboxChange}>
              <DropdownMenuRadioItem className="py-1 text-xs" value="all">
                All mailboxes
              </DropdownMenuRadioItem>
              {humanMailboxes.map((mailbox) => (
                <DropdownMenuRadioItem className="py-1 text-xs" key={mailbox.id} value={mailbox.id}>
                  <span className="truncate">{mailbox.address}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {agentMailboxes.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <PiRobot aria-hidden="true" />
                  Agent mailboxes
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={mailboxId} onValueChange={onMailboxChange}>
                  {agentMailboxes.map((mailbox) => (
                    <DropdownMenuRadioItem
                      className="py-1 text-xs"
                      key={mailbox.id}
                      value={mailbox.id}
                    >
                      <span className="truncate">{mailbox.address}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

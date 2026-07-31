import { MailPlus, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import type * as React from "react";

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CurrentUser } from "@/features/auth/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
import { mailboxUnreadLabel } from "@/features/notifications/unread";
import type { FolderId } from "@/lib/routes";
import { MobileNavigation } from "./mobile-navigation";

type TopBarProps = {
  activeFolder: FolderId;
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
  onSignedOut: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
};

export function TopBar({
  activeFolder,
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
  onSignedOut,
  onToggleSidebar,
  sidebarCollapsed = false
}: TopBarProps): React.ReactElement {
  return (
    <header className="flex h-14 w-full shrink-0 touch-none items-center gap-2 border-b bg-background px-3 md:px-4">
      {onToggleSidebar ? (
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                className="size-8 shrink-0"
                onClick={onToggleSidebar}
                size="icon"
                title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                type="button"
                variant="ghost"
              >
                {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      <MobileNavigation
        activeFolder={activeFolder}
        draftCount={draftCount}
        mailboxId={mailboxId}
        mailboxes={mailboxes}
        unread={unread}
        user={user}
        onFolderChange={onFolderChange}
        onMailboxChange={onMailboxChange}
        onSignedOut={onSignedOut}
      />
      <div className="relative min-w-0 max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 border-transparent bg-muted/70 pl-8 shadow-none focus-visible:border-input focus-visible:ring-1"
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
        <Button aria-label="New email" className="h-8 px-3" onClick={onCompose} type="button">
          <MailPlus />
          <span className="hidden sm:inline">Compose</span>
        </Button>
      </div>
    </header>
  );
}

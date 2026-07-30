import { Cable, MailPlus, Search } from "lucide-react";
import * as React from "react";

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
import type { Mailbox } from "@/features/mailboxes/types";
import { McpConnectionDialog } from "@/features/mcp/connection-dialog";
import type { UnreadCounts } from "@/features/notifications/types";
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
  onSignedOut
}: TopBarProps): React.ReactElement {
  const [mcpOpen, setMcpOpen] = React.useState(false);
  const mcpTriggerRef = React.useRef<HTMLButtonElement>(null);

  return (
    <header className="flex h-14 w-full shrink-0 items-center gap-2 border-b bg-background px-3 md:px-4">
      <MobileNavigation
        activeFolder={activeFolder}
        draftCount={draftCount}
        unread={unread}
        user={user}
        onFolderChange={onFolderChange}
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
          <SelectTrigger className="hidden h-8 w-52 border-transparent bg-muted/70 shadow-none lg:flex">
            <SelectValue placeholder="All mailboxes" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All mailboxes</SelectItem>
              {mailboxes.map((mailbox) => (
                <SelectItem key={mailbox.id} value={mailbox.id}>
                  {mailbox.address}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button aria-label="New email" className="h-8 px-3" onClick={onCompose} type="button">
          <MailPlus />
          <span className="hidden sm:inline">Compose</span>
        </Button>
        <div aria-hidden="true" className="hidden h-5 w-px bg-border md:block" />
        <Button
          className="hidden h-8 px-3 md:inline-flex"
          onClick={() => setMcpOpen(true)}
          ref={mcpTriggerRef}
          type="button"
          variant="outline"
        >
          <Cable />
          Connect MCP
        </Button>
        <McpConnectionDialog
          open={mcpOpen}
          restoreFocusRef={mcpTriggerRef}
          user={user}
          onOpenChange={setMcpOpen}
        />
      </div>
    </header>
  );
}

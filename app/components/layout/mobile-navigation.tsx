import { Cable, Menu } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentUser } from "@/features/auth/types";
import type { Mailbox } from "@/features/mailboxes/types";
import { McpConnectionDialog } from "@/features/mcp/connection-dialog";
import type { UnreadCounts } from "@/features/notifications/types";
import type { FolderId } from "@/lib/routes";
import { Sidebar } from "./sidebar";

type MobileNavigationProps = {
  activeFolder: FolderId;
  draftCount: number;
  mailboxId: string;
  mailboxes: Mailbox[];
  user: CurrentUser;
  unread: UnreadCounts;
  onFolderChange: (folder: FolderId) => void;
  onMailboxChange: (mailboxId: string) => void;
  onSignedOut: () => void;
};

export function MobileNavigation({
  activeFolder,
  draftCount,
  mailboxId,
  mailboxes,
  unread,
  user,
  onFolderChange,
  onMailboxChange,
  onSignedOut
}: MobileNavigationProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [mcpOpen, setMcpOpen] = React.useState(false);
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const drawerRef = React.useRef<HTMLDivElement>(null);

  function handleFolderChange(folder: FolderId): void {
    onFolderChange(folder);
    setOpen(false);
  }

  function handleMailboxChange(nextMailboxId: string): void {
    onMailboxChange(nextMailboxId);
    setOpen(false);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            aria-label="Open navigation"
            className="size-11 shrink-0 text-muted-foreground md:hidden"
            ref={menuTriggerRef}
            size="icon"
            title="Open navigation"
            type="button"
            variant="ghost"
          >
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent
          aria-describedby={undefined}
          className="w-[min(86vw,18rem)] p-0"
          overlayClassName="before:pointer-events-none before:fixed before:inset-x-0 before:top-0 before:h-[env(safe-area-inset-top)] before:bg-background after:pointer-events-none after:fixed after:inset-x-0 after:bottom-0 after:h-[env(safe-area-inset-bottom)] after:bg-background"
          ref={drawerRef}
          side="left"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            drawerRef.current?.querySelector<HTMLElement>("[data-navigation-item]")?.focus();
          }}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            activeFolder={activeFolder}
            draftCount={draftCount}
            mailboxId={mailboxId}
            mailboxFilter={{
              mailboxes,
              value: mailboxId,
              onChange: handleMailboxChange
            }}
            unread={unread}
            utilityAction={
              <Button
                className="h-11 w-full justify-start gap-2.5 px-2.5 text-sm font-normal text-muted-foreground"
                onClick={() => {
                  setOpen(false);
                  setMcpOpen(true);
                }}
                type="button"
                variant="ghost"
              >
                <Cable data-icon="inline-start" />
                Connect MCP
              </Button>
            }
            onFolderChange={handleFolderChange}
            onSignedOut={onSignedOut}
            user={user}
            variant="drawer"
          />
        </SheetContent>
      </Sheet>
      <McpConnectionDialog
        open={mcpOpen}
        restoreFocusRef={menuTriggerRef}
        user={user}
        onOpenChange={setMcpOpen}
      />
    </>
  );
}

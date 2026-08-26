import * as React from "react";
import { PiList } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentUser } from "@/features/auth/types";
import type { MailConnectionStatus } from "@/features/events/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
import type { AgentTabId, FolderId, SettingsTabId } from "@/lib/routes";
import { Sidebar } from "./sidebar";

type MobileNavigationProps = {
  activeFolder: FolderId;
  activeAgentTab?: AgentTabId | undefined;
  activeSettingsTab?: SettingsTabId | undefined;
  canManage?: boolean | undefined;
  connectionStatus?: MailConnectionStatus | undefined;
  draftCount: number;
  mailboxId: string;
  mailboxes: Mailbox[];
  user: CurrentUser;
  unread: UnreadCounts;
  onCompose?: () => void;
  onAgentTabChange?: ((tab: AgentTabId) => void) | undefined;
  onFolderChange: (folder: FolderId) => void;
  onMailboxChange: (mailboxId: string) => void;
  onSettingsTabChange?: ((tab: SettingsTabId) => void) | undefined;
  onSignedOut: () => void;
};

export function MobileNavigation({
  activeFolder,
  activeAgentTab,
  activeSettingsTab,
  canManage,
  connectionStatus,
  draftCount,
  mailboxId,
  mailboxes,
  unread,
  user,
  onCompose,
  onAgentTabChange,
  onFolderChange,
  onMailboxChange,
  onSettingsTabChange,
  onSignedOut
}: MobileNavigationProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const drawerRef = React.useRef<HTMLDivElement>(null);

  function handleFolderChange(folder: FolderId): void {
    onFolderChange(folder);
    setOpen(false);
  }

  function handleSectionChange(folder: FolderId): void {
    onFolderChange(folder);
  }

  function handleMailboxChange(nextMailboxId: string): void {
    onMailboxChange(nextMailboxId);
    setOpen(false);
  }

  function handleCompose(): void {
    onCompose?.();
    setOpen(false);
  }

  function handleSettingsTabChange(tab: SettingsTabId): void {
    onSettingsTabChange?.(tab);
    setOpen(false);
  }

  function handleAgentTabChange(tab: AgentTabId): void {
    onAgentTabChange?.(tab);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          aria-label="Open navigation"
          className="size-11 shrink-0 text-muted-foreground lg:hidden"
          size="icon"
          title="Open navigation"
          type="button"
          variant="ghost"
        >
          <PiList />
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby={undefined}
        className="w-[min(92vw,20rem)] p-0"
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
          activeAgentTab={activeAgentTab}
          activeSettingsTab={activeSettingsTab}
          canManage={canManage}
          connectionStatus={connectionStatus}
          draftCount={draftCount}
          mailboxId={mailboxId}
          mailboxFilter={{
            mailboxes,
            value: mailboxId,
            onChange: handleMailboxChange
          }}
          unread={unread}
          user={user}
          {...(onCompose ? { onCompose: handleCompose } : {})}
          {...(onAgentTabChange ? { onAgentTabChange: handleAgentTabChange } : {})}
          onFolderChange={handleFolderChange}
          onSectionChange={handleSectionChange}
          {...(onSettingsTabChange ? { onSettingsTabChange: handleSettingsTabChange } : {})}
          onSignedOut={onSignedOut}
          variant="drawer"
        />
      </SheetContent>
    </Sheet>
  );
}

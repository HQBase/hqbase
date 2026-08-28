import * as React from "react";
import { PiList } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentUser } from "@/features/auth/types";
import type { MailConnectionStatus } from "@/features/events/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
import type { FolderId, SettingsTabId } from "@/lib/routes";
import { Sidebar } from "./sidebar";

type MobileNavigationProps = {
  activeFolder: FolderId;
  activeSettingsTab?: SettingsTabId | undefined;
  canManage?: boolean | undefined;
  connectionStatus?: MailConnectionStatus | undefined;
  draftCount: number;
  mailboxId: string;
  mailboxes: Mailbox[];
  user: CurrentUser;
  unread: UnreadCounts;
  onCompose?: () => void;
  onFolderChange: (folder: FolderId) => void;
  onMailboxChange: (mailboxId: string) => void;
  onSettingsTabChange?: ((tab: SettingsTabId) => void) | undefined;
  onSignedOut: () => void;
};

export function MobileNavigation({
  activeFolder,
  activeSettingsTab,
  canManage,
  connectionStatus,
  draftCount,
  mailboxId,
  mailboxes,
  unread,
  user,
  onCompose,
  onFolderChange,
  onMailboxChange,
  onSettingsTabChange,
  onSignedOut
}: MobileNavigationProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [mailboxFilterOpen, setMailboxFilterOpen] = React.useState(false);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const suppressNextDrawerClickRef = React.useRef(false);

  function handleFolderChange(folder: FolderId): void {
    onFolderChange(folder);
    setOpen(false);
  }

  function handleSectionChange(folder: FolderId): void {
    onFolderChange(folder);
  }

  function handleMailboxChange(nextMailboxId: string): void {
    suppressNextDrawerClickRef.current = false;
    setMailboxFilterOpen(false);
    onMailboxChange(nextMailboxId);
    setOpen(false);
  }

  function handleDrawerPointerDownCapture(event: React.PointerEvent<HTMLDivElement>): void {
    if (!mailboxFilterOpen) return;
    suppressNextDrawerClickRef.current = true;
    event.stopPropagation();
    setMailboxFilterOpen(false);
  }

  function handleDrawerClickCapture(event: React.MouseEvent<HTMLDivElement>): void {
    if (!suppressNextDrawerClickRef.current) return;
    suppressNextDrawerClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleCompose(): void {
    onCompose?.();
    setOpen(false);
  }

  function handleSettingsTabChange(tab: SettingsTabId): void {
    onSettingsTabChange?.(tab);
    setOpen(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          suppressNextDrawerClickRef.current = false;
          setMailboxFilterOpen(false);
        }
      }}
    >
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
        className="w-[min(92vw,20rem)] border-r-0 p-0 shadow-none"
        overlayClassName="before:pointer-events-none before:fixed before:inset-x-0 before:top-0 before:h-[env(safe-area-inset-top)] before:bg-background after:pointer-events-none after:fixed after:inset-x-0 after:bottom-0 after:h-[env(safe-area-inset-bottom)] after:bg-background"
        ref={drawerRef}
        side="left"
        onClickCapture={handleDrawerClickCapture}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          drawerRef.current?.querySelector<HTMLElement>("[data-navigation-item]")?.focus();
        }}
        onPointerDownCapture={handleDrawerPointerDownCapture}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Sidebar
          activeFolder={activeFolder}
          activeSettingsTab={activeSettingsTab}
          canManage={canManage}
          connectionStatus={connectionStatus}
          draftCount={draftCount}
          mailboxId={mailboxId}
          mailboxFilter={{
            mailboxes,
            open: mailboxFilterOpen,
            value: mailboxId,
            onChange: handleMailboxChange,
            onOpenChange: setMailboxFilterOpen
          }}
          unread={unread}
          user={user}
          {...(onCompose ? { onCompose: handleCompose } : {})}
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

import * as React from "react";
import type { CurrentUser } from "@/features/auth/types";
import type { MailConnectionStatus } from "@/features/events/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
import type { GlobalSearchResult } from "@/features/search/types";
import type { UpdateStatus } from "@/features/updates/types";
import { UpdateBanner } from "@/features/updates/update-banner";
import { scrollActiveMobileMailSurfaceToTop } from "@/lib/mobile-scroll";
import type { FolderId } from "@/lib/routes";
import { readStoredBoolean, sidebarCollapsedStorageKey, storeLayoutValue } from "./desktop-layout";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

type AppShellProps = {
  activeFolder: FolderId;
  activeSettingsTab?: import("@/lib/routes").SettingsTabId | undefined;
  canManage?: boolean | undefined;
  connectionStatus: MailConnectionStatus;
  children: React.ReactNode;
  mailboxId: string;
  mailboxes: Mailbox[];
  search: string;
  user: CurrentUser;
  updateInProgress: boolean;
  updateReady: boolean;
  updateStatus: UpdateStatus | null;
  unread: UnreadCounts;
  draftCount: number;
  onCompose: () => void;
  onFolderChange: (folder: FolderId) => void;
  onSettingsTabChange?: ((tab: import("@/lib/routes").SettingsTabId) => void) | undefined;
  onMailboxChange: (mailboxId: string) => void;
  onSearchChange: (search: string) => void;
  onSearchSelect?: (result: GlobalSearchResult) => void;
  onSearchSubmit?: (query: string) => void;
  onSignedOut: () => void;
  onOpenUpdates: () => void;
};

export function AppShell(props: AppShellProps): React.ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() =>
    readStoredBoolean(sidebarCollapsedStorageKey, false)
  );

  const toggleSidebar = React.useCallback((): void => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    storeLayoutValue(sidebarCollapsedStorageKey, next);
  }, [sidebarCollapsed]);

  return (
    <div className="relative flex h-screen h-[100dvh] touch-manipulation overflow-hidden bg-rail pt-[env(safe-area-inset-top)] text-foreground lg:p-2">
      <div className="flex h-full w-full gap-2" id="hqbase-desktop-shell">
        <div
          className={sidebarCollapsed ? "hidden" : "hidden w-[20rem] shrink-0 lg:block"}
          id="desktop-sidebar"
        >
          <Sidebar
            activeFolder={props.activeFolder}
            activeSettingsTab={props.activeSettingsTab}
            canManage={props.canManage}
            connectionStatus={props.connectionStatus}
            draftCount={props.draftCount}
            mailboxId={props.mailboxId}
            sidebarCollapsed={sidebarCollapsed}
            unread={props.unread}
            user={props.user}
            onCompose={props.onCompose}
            onFolderChange={props.onFolderChange}
            onSettingsTabChange={props.onSettingsTabChange}
            onSignedOut={props.onSignedOut}
            onToggleSidebar={toggleSidebar}
          />
        </div>
        <div className="relative min-w-0 flex-1" id="desktop-content">
          <div className="h-full w-full overflow-hidden rounded-[24px] border border-divider bg-reader shadow-sm">
            <ShellContent
              {...props}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={toggleSidebar}
            />
          </div>
        </div>
      </div>
      <button
        aria-label="Scroll current view to top"
        className="absolute inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] touch-none cursor-default appearance-none border-0 bg-transparent p-0"
        tabIndex={-1}
        type="button"
        onClick={scrollActiveMobileMailSurfaceToTop}
      />
    </div>
  );
}

function ShellContent({
  activeFolder,
  activeSettingsTab,
  canManage,
  children,
  connectionStatus,
  draftCount,
  mailboxId,
  mailboxes,
  search,
  unread,
  updateInProgress,
  updateReady,
  updateStatus,
  user,
  onCompose,
  onFolderChange,
  onMailboxChange,
  onOpenUpdates,
  onSearchChange,
  onSearchSelect = () => undefined,
  onSearchSubmit = () => undefined,
  onSettingsTabChange,
  onSignedOut,
  sidebarCollapsed,
  onToggleSidebar
}: AppShellProps & {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}): React.ReactElement {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <TopBar
        activeFolder={activeFolder}
        activeSettingsTab={activeSettingsTab}
        canManage={canManage}
        connectionStatus={connectionStatus}
        draftCount={draftCount}
        mailboxId={mailboxId}
        mailboxes={mailboxes}
        search={search}
        unread={unread}
        user={user}
        sidebarCollapsed={sidebarCollapsed}
        onCompose={onCompose}
        onFolderChange={onFolderChange}
        onMailboxChange={onMailboxChange}
        onSearchChange={onSearchChange}
        onSearchSelect={onSearchSelect}
        onSearchSubmit={onSearchSubmit}
        onSettingsTabChange={onSettingsTabChange}
        onSignedOut={onSignedOut}
        onToggleSidebar={onToggleSidebar}
      />
      <UpdateBanner
        inProgress={updateInProgress}
        ready={updateReady}
        status={updateStatus}
        onOpen={onOpenUpdates}
      />
      <main className="min-h-0 flex-1 overflow-hidden bg-card/30">{children}</main>
    </div>
  );
}

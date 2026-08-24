import type * as React from "react";
import { PiSidebar, PiSidebarSimple } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CurrentUser } from "@/features/auth/types";
import type { MailConnectionStatus } from "@/features/events/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
import { cn } from "@/lib/cn";
import type { FolderId, SettingsTabId } from "@/lib/routes";
import { appRoutePath } from "@/lib/routes";
import { AccountMenu } from "./account-menu";
import { quickAccess } from "./sidebar/constants";
import { MailConnectionIndicator } from "./sidebar/mail-connection-indicator";
import { isModifiedNavigation } from "./sidebar/sidebar-helpers";
import { ContactsNav, MailNav, SettingsNav } from "./sidebar/sidebar-nav";

type SidebarProps = {
  activeFolder: FolderId;
  draftCount?: number;
  mailboxId: string;
  mailboxFilter?: {
    mailboxes: Mailbox[];
    value: string;
    onChange: (mailboxId: string) => void;
  };
  user: CurrentUser;
  unread: UnreadCounts;
  onCompose?: () => void;
  onFolderChange: (folder: FolderId) => void;
  onSignedOut: () => void;
  variant?: "desktop" | "drawer";
  sidebarCollapsed?: boolean;
  activeSettingsTab?: SettingsTabId | undefined;
  canManage?: boolean | undefined;
  connectionStatus?: MailConnectionStatus | undefined;
  onSettingsTabChange?: ((tab: SettingsTabId) => void) | undefined;
  onToggleSidebar?: () => void;
};

export function Sidebar({
  activeFolder,
  draftCount = 0,
  mailboxId,
  mailboxFilter,
  unread,
  user,
  onCompose,
  onFolderChange,
  onSignedOut,
  variant = "desktop",
  sidebarCollapsed = false,
  activeSettingsTab,
  canManage = false,
  connectionStatus = "connecting",
  onSettingsTabChange,
  onToggleSidebar
}: SidebarProps): React.ReactElement {
  const isDrawer = variant === "drawer";

  return (
    <aside
      className={cn(
        "flex-col text-foreground",
        isDrawer
          ? "flex h-full w-full bg-sidebar pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]"
          : "hidden h-full w-full bg-rail lg:flex"
      )}
    >
      <div className="flex h-full min-h-0 flex-1">
        {!isDrawer ? (
          <nav
            aria-label="Quick access"
            className="flex w-12 shrink-0 flex-col items-center py-2 pr-2 pl-1"
          >
            <a
              aria-label="Inbox"
              className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={appRoutePath({ kind: "mail", folder: "inbox", messageId: null })}
              onClick={(event) => {
                if (isModifiedNavigation(event)) return;
                event.preventDefault();
                onFolderChange("inbox");
              }}
            >
              <img alt="" className="size-7 rounded-md object-contain" src="/logo.svg" />
            </a>
            <div className="mt-5 flex flex-col gap-1">
              {quickAccess.map(({ folder, icon: Icon, label }) => {
                const isActive =
                  folder === "inbox"
                    ? activeFolder !== "settings" && activeFolder !== "contacts"
                    : activeFolder === folder;
                return (
                  <Button
                    asChild
                    className={cn(
                      "size-9 text-tertiary [@media(hover:hover)]:hover:bg-muted/70 [@media(hover:hover)]:hover:text-foreground",
                      isActive && "bg-selected text-foreground"
                    )}
                    key={folder}
                    size="icon"
                    title={label}
                    type="button"
                    variant="ghost"
                  >
                    <a
                      aria-current={isActive ? "page" : undefined}
                      aria-label={label}
                      href={
                        folder === "settings"
                          ? appRoutePath({ kind: "settings", tab: "mailboxes" })
                          : folder === "contacts"
                            ? appRoutePath({ kind: "contacts", contactId: null })
                            : appRoutePath({ kind: "mail", folder, messageId: null })
                      }
                      onClick={(event) => {
                        if (isModifiedNavigation(event)) return;
                        event.preventDefault();
                        onFolderChange(folder);
                      }}
                    >
                      <Icon />
                    </a>
                  </Button>
                );
              })}
            </div>
            <div className="mt-auto flex flex-col items-center gap-1">
              <AccountMenu compact user={user} onSignedOut={onSignedOut} />
            </div>
          </nav>
        ) : null}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col p-2",
            !isDrawer &&
              "ml-2 h-full overflow-hidden rounded-[24px] border border-divider bg-sidebar p-2 shadow-sm"
          )}
        >
          <div className="mb-5 flex h-9 items-center justify-between gap-3 px-3.5 pr-0">
            <div className="flex min-w-0 items-center gap-3">
              {isDrawer ? <img alt="" className="h-7 w-auto shrink-0" src="/logo.svg" /> : null}
              <span className="truncate text-sm font-semibold leading-none tracking-tight">
                {activeFolder === "settings"
                  ? "Settings"
                  : activeFolder === "contacts"
                    ? "Contacts"
                    : "Mail"}
              </span>
              <MailConnectionIndicator status={connectionStatus} />
            </div>
            {onToggleSidebar ? (
              <TooltipProvider delayDuration={250}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                      className="size-10 min-h-10 min-w-10 shrink-0 text-tertiary"
                      onClick={onToggleSidebar}
                      size="icon"
                      title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                      type="button"
                      variant="ghost"
                    >
                      {sidebarCollapsed ? <PiSidebarSimple /> : <PiSidebar />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
          {activeFolder === "settings" ? (
            <SettingsNav
              activeSettingsTab={activeSettingsTab}
              canManage={canManage}
              isDrawer={isDrawer}
              user={user}
              onCompose={onCompose}
              onFolderChange={onFolderChange}
              onSettingsTabChange={onSettingsTabChange}
              onSignedOut={onSignedOut}
            />
          ) : activeFolder === "contacts" ? (
            <ContactsNav
              isDrawer={isDrawer}
              user={user}
              onCompose={onCompose}
              onFolderChange={onFolderChange}
              onSignedOut={onSignedOut}
            />
          ) : (
            <MailNav
              activeFolder={activeFolder}
              draftCount={draftCount}
              mailboxId={mailboxId}
              mailboxFilter={mailboxFilter}
              unread={unread}
              isDrawer={isDrawer}
              user={user}
              onCompose={onCompose}
              onFolderChange={onFolderChange}
              onSignedOut={onSignedOut}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

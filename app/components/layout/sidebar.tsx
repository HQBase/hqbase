import type * as React from "react";
import { PiSidebar, PiSidebarSimple } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CurrentUser } from "@/features/auth/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
import { cn } from "@/lib/cn";
import type { FolderId, SettingsTabId } from "@/lib/routes";
import { appRoutePath } from "@/lib/routes";
import { AccountMenu } from "./account-menu";
import { quickAccess } from "./sidebar/constants";
import { isModifiedNavigation } from "./sidebar/sidebar-helpers";
import { AgentsNav, ContactsNav, MailNav, SettingsNav } from "./sidebar/sidebar-nav";

type SidebarProps = {
  activeFolder: FolderId;
  draftCount?: number;
  mailboxId: string;
  mailboxFilter?: {
    mailboxes: Mailbox[];
    open?: boolean;
    value: string;
    onChange: (mailboxId: string) => void;
    onOpenChange?: (open: boolean) => void;
  };
  user: CurrentUser;
  unread: UnreadCounts;
  onCompose?: () => void;
  onFolderChange: (folder: FolderId) => void;
  onSectionChange?: ((folder: FolderId) => void) | undefined;
  onSignedOut: () => void;
  variant?: "desktop" | "drawer";
  sidebarCollapsed?: boolean;
  activeSettingsTab?: SettingsTabId | undefined;
  canManage?: boolean | undefined;
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
  onSectionChange,
  onSignedOut,
  variant = "desktop",
  sidebarCollapsed = false,
  activeSettingsTab,
  canManage = false,
  onSettingsTabChange,
  onToggleSidebar
}: SidebarProps): React.ReactElement {
  const isDrawer = variant === "drawer";
  const handleSectionChange = onSectionChange ?? onFolderChange;

  return (
    <aside
      className={cn(
        "flex-col text-foreground",
        isDrawer ? "flex h-full w-full bg-transparent" : "hidden h-full w-full bg-rail lg:flex"
      )}
    >
      <div className="flex h-full min-h-0 flex-1">
        <nav
          aria-label="Quick access"
          className={cn(
            "flex w-12 shrink-0 flex-col items-center",
            isDrawer
              ? "bg-black px-1 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))]"
              : "py-2 pr-2 pl-1"
          )}
        >
          <a
            aria-label="Inbox"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={appRoutePath({ kind: "mail", folder: "inbox", messageId: null })}
            onClick={(event) => {
              if (isModifiedNavigation(event)) return;
              event.preventDefault();
              handleSectionChange("inbox");
            }}
          >
            <img alt="" className="size-7 rounded-md object-contain" src="/logo.svg" />
          </a>
          <div className={cn("mt-5 flex flex-col gap-1", isDrawer && "w-full items-center")}>
            {quickAccess.map(({ folder, icon: Icon, label }) => {
              const isActive =
                folder === "inbox"
                  ? !["settings", "contacts", "agents"].includes(activeFolder)
                  : activeFolder === folder;
              return (
                <Button
                  asChild
                  className={cn(
                    "text-tertiary [@media(hover:hover)]:hover:bg-muted/70 [@media(hover:hover)]:hover:text-foreground",
                    "size-10 min-h-10 min-w-10",
                    isActive &&
                      "bg-selected text-foreground [@media(hover:hover)]:hover:bg-selected"
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
                        : folder === "agents"
                          ? appRoutePath({ kind: "agents" })
                          : folder === "contacts"
                            ? appRoutePath({ kind: "contacts", contactId: null })
                            : appRoutePath({ kind: "mail", folder, messageId: null })
                    }
                    onClick={(event) => {
                      if (isModifiedNavigation(event)) return;
                      event.preventDefault();
                      handleSectionChange(folder);
                    }}
                  >
                    <Icon />
                  </a>
                </Button>
              );
            })}
          </div>
          <div className={cn("mt-auto flex flex-col items-center gap-1", isDrawer && "w-full")}>
            <AccountMenu compact user={user} onSignedOut={onSignedOut} />
          </div>
        </nav>
        <div
          className={cn(
            "flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-sidebar",
            isDrawer
              ? "px-2 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))]"
              : "ml-2 rounded-[24px] border border-divider p-2 shadow-sm"
          )}
        >
          <div className="mb-5 flex h-9 items-center justify-between gap-3 px-3.5 pr-0">
            <div className="flex min-w-0 items-center">
              <span className="truncate text-sm font-semibold leading-none tracking-tight">
                {activeFolder === "settings"
                  ? "Settings"
                  : activeFolder === "agents"
                    ? "Agents"
                    : activeFolder === "contacts"
                      ? "Contacts"
                      : "Mail"}
              </span>
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
              onCompose={onCompose}
              onSettingsTabChange={onSettingsTabChange}
            />
          ) : activeFolder === "agents" ? (
            <AgentsNav isDrawer={isDrawer} onCompose={onCompose} onFolderChange={onFolderChange} />
          ) : activeFolder === "contacts" ? (
            <ContactsNav
              isDrawer={isDrawer}
              onCompose={onCompose}
              onFolderChange={onFolderChange}
            />
          ) : (
            <MailNav
              activeFolder={activeFolder}
              draftCount={draftCount}
              mailboxId={mailboxId}
              mailboxFilter={mailboxFilter}
              unread={unread}
              isDrawer={isDrawer}
              onCompose={onCompose}
              onFolderChange={onFolderChange}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

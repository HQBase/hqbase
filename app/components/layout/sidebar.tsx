import type { LucideIcon } from "lucide-react";
import {
  Archive,
  FilePenLine,
  Inbox,
  Send,
  Settings,
  Star,
  Trash2,
  TriangleAlert
} from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/features/auth/types";
import type { UnreadCounts } from "@/features/notifications/types";
import { ThemeSwitcher } from "@/features/theme/theme-switcher";
import { cn } from "@/lib/cn";
import type { FolderId } from "@/lib/routes";
import { appRoutePath, draftFolder, mailFolders } from "@/lib/routes";
import { AccountMenu } from "./account-menu";

type SidebarProps = {
  activeFolder: FolderId;
  draftCount?: number;
  utilityAction?: React.ReactNode;
  user: CurrentUser;
  unread: UnreadCounts;
  onFolderChange: (folder: FolderId) => void;
  onSignedOut: () => void;
  resizable?: boolean;
  variant?: "desktop" | "drawer";
};

const icons: Record<FolderId, LucideIcon> = {
  inbox: Inbox,
  sent: Send,
  drafts: FilePenLine,
  starred: Star,
  archived: Archive,
  trash: Trash2,
  catchall: TriangleAlert,
  settings: Settings
};

export function Sidebar({
  activeFolder,
  draftCount = 0,
  utilityAction,
  unread,
  user,
  onFolderChange,
  onSignedOut,
  resizable = false,
  variant = "desktop"
}: SidebarProps): React.ReactElement {
  const isDrawer = variant === "drawer";
  const navigationFolders: Array<(typeof mailFolders)[number] | typeof draftFolder> = [];
  for (const folder of mailFolders) {
    navigationFolders.push(folder);
    if (folder.id === "sent" && (draftCount > 0 || activeFolder === "drafts")) {
      navigationFolders.push(draftFolder);
    }
  }

  return (
    <aside
      className={cn(
        "flex-col bg-background px-3 py-3",
        isDrawer
          ? "flex h-full w-full pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]"
          : resizable
            ? "hidden h-full w-full md:flex"
            : "hidden w-56 shrink-0 border-r md:flex"
      )}
    >
      <div className="mb-7 flex h-9 items-center gap-2.5 px-2">
        <img alt="" className="h-7 w-auto shrink-0" src="/logo.svg" />
        <span className="text-sm font-medium tracking-tight">HQBase</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {navigationFolders.map((folder) => {
          const Icon = icons[folder.id];
          const unreadCount =
            folder.id === "inbox" ? unread.inbox : folder.id === "catchall" ? unread.catchall : 0;
          const count = folder.id === "drafts" ? draftCount : unreadCount;
          return (
            <Button
              asChild
              className={cn(
                "h-8 justify-start gap-2.5 px-2.5 text-[13px] font-normal text-muted-foreground",
                isDrawer && "h-11 text-sm",
                activeFolder === folder.id && "bg-muted text-foreground"
              )}
              key={folder.id}
              variant="ghost"
            >
              <a
                aria-current={activeFolder === folder.id ? "page" : undefined}
                data-navigation-item
                href={appRoutePath(
                  folder.id === "drafts"
                    ? { kind: "drafts", draftId: null }
                    : { kind: "mail", folder: folder.id, messageId: null }
                )}
                onClick={(event) => {
                  if (isModifiedNavigation(event)) return;
                  event.preventDefault();
                  onFolderChange(folder.id);
                }}
              >
                <Icon />
                <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                {count > 0 ? (
                  <span className="ml-auto font-mono text-[11px] text-foreground">
                    <span className="sr-only">
                      {folder.id === "drafts" ? `${count} drafts` : `${count} unread`}
                    </span>
                    <span aria-hidden="true">{count.toLocaleString()}</span>
                  </span>
                ) : null}
              </a>
            </Button>
          );
        })}
        <div className="mt-auto">
          <div className="flex flex-col gap-0.5 border-t pt-2">
            {utilityAction}
            <Button
              asChild
              className={cn(
                "h-8 w-full justify-start gap-2.5 px-2.5 text-[13px] font-normal text-muted-foreground",
                isDrawer && "h-11 text-sm",
                activeFolder === "settings" && "bg-muted text-foreground"
              )}
              variant="ghost"
            >
              <a
                aria-current={activeFolder === "settings" ? "page" : undefined}
                href={appRoutePath({ kind: "settings", tab: "mailboxes" })}
                onClick={(event) => {
                  if (isModifiedNavigation(event)) return;
                  event.preventDefault();
                  onFolderChange("settings");
                }}
              >
                <Settings />
                Settings
              </a>
            </Button>
            <ThemeSwitcher drawer={isDrawer} />
          </div>
          <div className="mt-2 border-t pt-2">
            <AccountMenu drawer={isDrawer} user={user} onSignedOut={onSignedOut} />
          </div>
        </div>
      </nav>
    </aside>
  );
}

function isModifiedNavigation(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

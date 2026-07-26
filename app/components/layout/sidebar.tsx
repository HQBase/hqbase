import type { LucideIcon } from "lucide-react";
import { Archive, Inbox, Send, Settings, Star, Trash2, TriangleAlert } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { FolderId } from "@/lib/routes";
import { appRoutePath, mailFolders } from "@/lib/routes";

type SidebarProps = {
  activeFolder: FolderId;
  drawerAction?: React.ReactNode;
  onFolderChange: (folder: FolderId) => void;
  variant?: "desktop" | "drawer";
};

const icons: Record<FolderId, LucideIcon> = {
  inbox: Inbox,
  sent: Send,
  starred: Star,
  archived: Archive,
  trash: Trash2,
  catchall: TriangleAlert,
  settings: Settings
};

export function Sidebar({
  activeFolder,
  drawerAction,
  onFolderChange,
  variant = "desktop"
}: SidebarProps): React.ReactElement {
  const isDrawer = variant === "drawer";

  return (
    <aside
      className={cn(
        "w-56 shrink-0 flex-col bg-background p-3",
        isDrawer ? "flex h-full w-full" : "hidden border-r md:flex"
      )}
    >
      <div className="mb-7 flex h-9 items-center gap-2.5 px-2">
        <img alt="" className="h-7 w-auto shrink-0" src="/logo.svg" />
        <span className="text-sm font-medium tracking-tight">HQBase</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {mailFolders.map((folder) => {
          const Icon = icons[folder.id];
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
                href={appRoutePath({ kind: "mail", folder: folder.id, messageId: null })}
                onClick={(event) => {
                  if (isModifiedNavigation(event)) return;
                  event.preventDefault();
                  onFolderChange(folder.id);
                }}
              >
                <Icon />
                {folder.label}
              </a>
            </Button>
          );
        })}
        <div className="mt-auto border-t pt-2">
          {isDrawer && drawerAction ? <div className="mb-0.5">{drawerAction}</div> : null}
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
        </div>
      </nav>
    </aside>
  );
}

function isModifiedNavigation(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

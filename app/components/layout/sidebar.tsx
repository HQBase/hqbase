import type { LucideIcon } from "lucide-react";
import { Archive, Inbox, Send, Settings, Star, Trash2, TriangleAlert } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { FolderId } from "@/lib/routes";
import { folders } from "@/lib/routes";

type SidebarProps = {
  activeFolder: FolderId;
  onFolderChange: (folder: FolderId) => void;
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

export function Sidebar({ activeFolder, onFolderChange }: SidebarProps): React.ReactElement {
  const mailFolders = folders.filter((folder) => folder.id !== "settings");

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-background p-3 md:flex">
      <div className="mb-7 flex h-9 items-center gap-2.5 px-2">
        <img alt="" className="h-7 w-auto shrink-0" src="/logo.svg" />
        <span className="text-sm font-medium tracking-tight">HQBase</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {mailFolders.map((folder) => {
          const Icon = icons[folder.id];
          return (
            <Button
              className={cn(
                "h-8 justify-start gap-2.5 px-2.5 text-[13px] font-normal text-muted-foreground",
                activeFolder === folder.id && "bg-muted text-foreground"
              )}
              key={folder.id}
              onClick={() => onFolderChange(folder.id)}
              type="button"
              variant="ghost"
            >
              <Icon />
              {folder.label}
            </Button>
          );
        })}
        <div className="mt-auto border-t pt-2">
          <Button
            className={cn(
              "h-8 w-full justify-start gap-2.5 px-2.5 text-[13px] font-normal text-muted-foreground",
              activeFolder === "settings" && "bg-muted text-foreground"
            )}
            onClick={() => onFolderChange("settings")}
            type="button"
            variant="ghost"
          >
            <Settings />
            Settings
          </Button>
        </div>
      </nav>
    </aside>
  );
}

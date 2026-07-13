import type * as React from "react";
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
import type { UpdateStatus } from "@/features/updates/types";
import { UpdateBanner } from "@/features/updates/update-banner";
import type { FolderId } from "@/lib/routes";
import { folders } from "@/lib/routes";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

type AppShellProps = {
  activeFolder: FolderId;
  children: React.ReactNode;
  mailboxId: string;
  mailboxes: Mailbox[];
  search: string;
  user: CurrentUser;
  updateStatus: UpdateStatus | null;
  onCompose: () => void;
  onFolderChange: (folder: FolderId) => void;
  onMailboxChange: (mailboxId: string) => void;
  onSearchChange: (search: string) => void;
  onSignedOut: () => void;
  onOpenUpdates: () => void;
};

export function AppShell(props: AppShellProps): React.ReactElement {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar activeFolder={props.activeFolder} onFolderChange={props.onFolderChange} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          mailboxId={props.mailboxId}
          mailboxes={props.mailboxes}
          search={props.search}
          user={props.user}
          onCompose={props.onCompose}
          onMailboxChange={props.onMailboxChange}
          onSearchChange={props.onSearchChange}
          onSignedOut={props.onSignedOut}
        />
        <UpdateBanner status={props.updateStatus} onOpen={props.onOpenUpdates} />
        <div className="flex h-11 items-center border-b px-3 md:hidden">
          <Select
            value={props.activeFolder}
            onValueChange={(value) => props.onFolderChange(value as FolderId)}
          >
            <SelectTrigger className="h-8 border-transparent bg-muted/70 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <main className="min-h-0 flex-1 overflow-hidden bg-card/30">{props.children}</main>
      </div>
    </div>
  );
}

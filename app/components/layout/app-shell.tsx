import type * as React from "react";
import type { CurrentUser } from "@/features/auth/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
import type { UpdateStatus } from "@/features/updates/types";
import { UpdateBanner } from "@/features/updates/update-banner";
import { cn } from "@/lib/cn";
import type { FolderId } from "@/lib/routes";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

type AppShellProps = {
  activeFolder: FolderId;
  children: React.ReactNode;
  mailboxId: string;
  mailboxes: Mailbox[];
  immersiveOnCompact?: boolean;
  search: string;
  user: CurrentUser;
  updateInProgress: boolean;
  updateStatus: UpdateStatus | null;
  unread: UnreadCounts;
  onCompose: () => void;
  onFolderChange: (folder: FolderId) => void;
  onMailboxChange: (mailboxId: string) => void;
  onSearchChange: (search: string) => void;
  onSignedOut: () => void;
  onOpenUpdates: () => void;
};

export function AppShell(props: AppShellProps): React.ReactElement {
  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-background pt-[env(safe-area-inset-top)] text-foreground">
      <Sidebar
        activeFolder={props.activeFolder}
        unread={props.unread}
        user={props.user}
        onFolderChange={props.onFolderChange}
        onSignedOut={props.onSignedOut}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn(props.immersiveOnCompact && "hidden lg:contents")}>
          <TopBar
            activeFolder={props.activeFolder}
            unread={props.unread}
            mailboxId={props.mailboxId}
            mailboxes={props.mailboxes}
            search={props.search}
            user={props.user}
            onCompose={props.onCompose}
            onFolderChange={props.onFolderChange}
            onMailboxChange={props.onMailboxChange}
            onSearchChange={props.onSearchChange}
            onSignedOut={props.onSignedOut}
          />
          <UpdateBanner
            inProgress={props.updateInProgress}
            status={props.updateStatus}
            onOpen={props.onOpenUpdates}
          />
        </div>
        <main className="min-h-0 flex-1 overflow-hidden bg-card/30">{props.children}</main>
      </div>
    </div>
  );
}

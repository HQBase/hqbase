import type * as React from "react";
import { PiAddressBook, PiGear, PiTray } from "react-icons/pi";
import { AccountMenu } from "@/components/layout/account-menu";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/features/auth/types";
import type { FolderId } from "@/lib/routes";
import { appRoutePath } from "@/lib/routes";

function isModifiedNavigation(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function DrawerMailFooter({
  onFolderChange,
  user,
  onSignedOut
}: {
  onFolderChange: (folder: FolderId) => void;
  user: CurrentUser;
  onSignedOut: () => void;
}): React.ReactElement {
  return (
    <div className="mt-auto pt-2">
      <PrimaryLink
        folder="contacts"
        href={appRoutePath({ kind: "contacts", contactId: null })}
        icon={<PiAddressBook />}
        label="Contacts"
        onFolderChange={onFolderChange}
      />
      <Button
        asChild
        className="h-11 justify-start gap-3 rounded-[16px] px-3.5 text-sm font-medium text-muted-foreground dark:font-normal [&_svg]:size-4 [&_svg]:shrink-0"
        variant="ghost"
      >
        <a
          href={appRoutePath({ kind: "settings", tab: "mailboxes" })}
          onClick={(event) => {
            if (isModifiedNavigation(event)) return;
            event.preventDefault();
            onFolderChange("settings");
          }}
        >
          <PiGear />
          <span className="min-w-0 flex-1 truncate leading-none">Settings</span>
        </a>
      </Button>
      <div className="mt-2 border-t border-divider pt-2">
        <AccountMenu drawer user={user} onSignedOut={onSignedOut} />
      </div>
    </div>
  );
}

export function DrawerSettingsFooter({
  onFolderChange,
  user,
  onSignedOut
}: {
  onFolderChange: (folder: FolderId) => void;
  user: CurrentUser;
  onSignedOut: () => void;
}): React.ReactElement {
  return (
    <div className="mt-auto border-t border-divider pt-2">
      <PrimaryLink
        folder="inbox"
        href={appRoutePath({ kind: "mail", folder: "inbox", messageId: null })}
        icon={<PiTray />}
        label="Mail"
        onFolderChange={onFolderChange}
      />
      <PrimaryLink
        folder="contacts"
        href={appRoutePath({ kind: "contacts", contactId: null })}
        icon={<PiAddressBook />}
        label="Contacts"
        onFolderChange={onFolderChange}
      />
      <div className="mt-2 border-t border-divider pt-2">
        <AccountMenu drawer user={user} onSignedOut={onSignedOut} />
      </div>
    </div>
  );
}

export function DrawerContactsFooter({
  onFolderChange,
  user,
  onSignedOut
}: {
  onFolderChange: (folder: FolderId) => void;
  user: CurrentUser;
  onSignedOut: () => void;
}): React.ReactElement {
  return (
    <div className="mt-auto border-t border-divider pt-2">
      <PrimaryLink
        folder="inbox"
        href={appRoutePath({ kind: "mail", folder: "inbox", messageId: null })}
        icon={<PiTray />}
        label="Mail"
        onFolderChange={onFolderChange}
      />
      <PrimaryLink
        folder="settings"
        href={appRoutePath({ kind: "settings", tab: "mailboxes" })}
        icon={<PiGear />}
        label="Settings"
        onFolderChange={onFolderChange}
      />
      <div className="mt-2 border-t border-divider pt-2">
        <AccountMenu drawer user={user} onSignedOut={onSignedOut} />
      </div>
    </div>
  );
}

function PrimaryLink({
  folder,
  href,
  icon,
  label,
  onFolderChange
}: {
  folder: FolderId;
  href: string;
  icon: React.ReactNode;
  label: string;
  onFolderChange: (folder: FolderId) => void;
}): React.ReactElement {
  return (
    <Button
      asChild
      className="h-11 justify-start gap-3 rounded-[16px] px-3.5 text-sm font-medium text-muted-foreground dark:font-normal [&_svg]:size-4 [&_svg]:shrink-0"
      variant="ghost"
    >
      <a
        href={href}
        onClick={(event) => {
          if (isModifiedNavigation(event)) return;
          event.preventDefault();
          onFolderChange(folder);
        }}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate leading-none">{label}</span>
      </a>
    </Button>
  );
}

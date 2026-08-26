import type * as React from "react";

import { Button } from "@/components/ui/button";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { Mailbox } from "@/features/mailboxes/types";
import type { UnreadCounts } from "@/features/notifications/types";
import { inboxUnreadForMailbox } from "@/features/notifications/unread";
import { cn } from "@/lib/cn";
import type { AgentTabId, FolderId, SettingsTabId } from "@/lib/routes";
import { agentTabs, appRoutePath, draftFolder, mailFolders, settingsTabs } from "@/lib/routes";
import {
  agentTabIcons,
  agentTabLabels,
  icons,
  PiAddressBook,
  PiNotePencil,
  settingsTabIcons,
  settingsTabLabels
} from "./constants";
import { isModifiedNavigation } from "./sidebar-helpers";

export function SettingsNav({
  activeSettingsTab,
  canManage,
  isDrawer,
  onSettingsTabChange,
  onCompose
}: {
  activeSettingsTab: SettingsTabId | undefined;
  canManage: boolean;
  isDrawer: boolean;
  onSettingsTabChange: ((tab: SettingsTabId) => void) | undefined;
  onCompose: (() => void) | undefined;
}): React.ReactElement {
  return (
    <>
      {onCompose ? (
        <Button
          className="btn-liquid-glass mb-4 h-10 w-full justify-start gap-3 rounded-full px-3.5 text-sm font-medium"
          onClick={onCompose}
          type="button"
          variant="ghost"
        >
          <PiNotePencil className="size-4" />
          <span className="leading-none">New email</span>
        </Button>
      ) : null}
      <nav aria-label="Settings navigation" className="flex min-h-0 flex-1 flex-col gap-0.5">
        <span className="mb-1 px-3.5 text-[10px] font-medium uppercase tracking-[0.12em] text-tertiary">
          Settings
        </span>
        {settingsTabs
          .filter((tab) => {
            if ((tab === "domains" || tab === "updates") && !canManage) {
              return false;
            }
            return true;
          })
          .map((tab) => {
            const Icon = settingsTabIcons[tab];
            const label = settingsTabLabels[tab];
            const isActive = activeSettingsTab === tab;
            return (
              <Button
                asChild
                className={cn(
                  "h-8 justify-start gap-3 rounded-[16px] px-3.5 text-[13px] font-medium leading-none text-muted-foreground dark:font-normal [&_svg]:size-4 [&_svg]:shrink-0",
                  isDrawer && "h-11 rounded-[16px] text-sm",
                  isActive && "bg-selected text-foreground [@media(hover:hover)]:hover:bg-selected"
                )}
                key={tab}
                variant="ghost"
              >
                <a
                  aria-current={isActive ? "page" : undefined}
                  data-navigation-item={isActive ? true : undefined}
                  href={appRoutePath({ kind: "settings", tab })}
                  onClick={(event) => {
                    if (isModifiedNavigation(event)) return;
                    if (!onSettingsTabChange) return;
                    event.preventDefault();
                    onSettingsTabChange(tab);
                  }}
                >
                  <Icon />
                  <span className="min-w-0 flex-1 truncate leading-none">{label}</span>
                </a>
              </Button>
            );
          })}
      </nav>
    </>
  );
}

export function AgentsNav({
  activeAgentTab,
  canManage,
  isDrawer,
  onAgentTabChange,
  onCompose
}: {
  activeAgentTab: AgentTabId | undefined;
  canManage: boolean;
  isDrawer: boolean;
  onAgentTabChange: ((tab: AgentTabId) => void) | undefined;
  onCompose: (() => void) | undefined;
}): React.ReactElement {
  return (
    <>
      {onCompose ? (
        <Button
          className="btn-liquid-glass mb-4 h-10 w-full justify-start gap-3 rounded-full px-3.5 text-sm font-medium"
          onClick={onCompose}
          type="button"
          variant="ghost"
        >
          <PiNotePencil className="size-4" />
          <span className="leading-none">New email</span>
        </Button>
      ) : null}
      <nav aria-label="Agents navigation" className="flex min-h-0 flex-1 flex-col gap-0.5">
        <span className="mb-1 px-3.5 text-[10px] font-medium uppercase tracking-[0.12em] text-tertiary">
          Agents
        </span>
        {agentTabs
          .filter((tab) => tab === "connections" || canManage)
          .map((tab) => {
            const Icon = agentTabIcons[tab];
            const label = agentTabLabels[tab];
            const isActive = activeAgentTab === tab;
            return (
              <Button
                asChild
                className={cn(
                  "h-8 justify-start gap-3 rounded-[16px] px-3.5 text-[13px] font-medium leading-none text-muted-foreground dark:font-normal [&_svg]:size-4 [&_svg]:shrink-0",
                  isDrawer && "h-11 rounded-[16px] text-sm",
                  isActive && "bg-selected text-foreground [@media(hover:hover)]:hover:bg-selected"
                )}
                key={tab}
                variant="ghost"
              >
                <a
                  aria-current={isActive ? "page" : undefined}
                  data-navigation-item={isActive ? true : undefined}
                  href={appRoutePath({ kind: "agents", tab })}
                  onClick={(event) => {
                    if (isModifiedNavigation(event)) return;
                    if (!onAgentTabChange) return;
                    event.preventDefault();
                    onAgentTabChange(tab);
                  }}
                >
                  <Icon />
                  <span className="min-w-0 flex-1 truncate leading-none">{label}</span>
                </a>
              </Button>
            );
          })}
      </nav>
    </>
  );
}

export function MailNav({
  activeFolder,
  draftCount,
  mailboxId,
  mailboxFilter,
  unread,
  isDrawer,
  onFolderChange,
  onCompose
}: {
  activeFolder: FolderId;
  draftCount: number;
  mailboxId: string;
  mailboxFilter:
    | {
        mailboxes: Mailbox[];
        open?: boolean;
        value: string;
        onChange: (v: string) => void;
        onOpenChange?: (open: boolean) => void;
      }
    | undefined;
  unread: UnreadCounts;
  isDrawer: boolean;
  onFolderChange: (folder: FolderId) => void;
  onCompose: (() => void) | undefined;
}): React.ReactElement {
  const navigationFolders: Array<(typeof mailFolders)[number] | typeof draftFolder> = [];
  for (const folder of mailFolders) {
    navigationFolders.push(folder);
    if (folder.id === "sent" && (draftCount > 0 || activeFolder === "drafts")) {
      navigationFolders.push(draftFolder);
    }
  }

  return (
    <>
      {onCompose ? (
        <Button
          className="btn-liquid-glass mb-4 h-10 w-full justify-start gap-3 rounded-full px-3.5 text-sm font-medium"
          onClick={onCompose}
          type="button"
          variant="ghost"
        >
          <PiNotePencil className="size-4" />
          <span className="leading-none">New email</span>
        </Button>
      ) : null}
      {isDrawer && mailboxFilter ? (
        <FieldGroup className="mb-4 gap-0 px-2">
          <Field className="gap-1.5">
            <FieldLabel
              className="text-xs font-medium text-muted-foreground"
              htmlFor="drawer-mailbox-filter"
            >
              Mailbox
            </FieldLabel>
            <DropdownSelect
              ariaLabel="Mailbox filter"
              className="h-11 min-h-11 bg-muted/70 shadow-none"
              id="drawer-mailbox-filter"
              options={[
                {
                  label: "All mailboxes",
                  value: "all"
                },
                ...mailboxFilter.mailboxes.map((mailbox) => ({
                  label: mailbox.address,
                  value: mailbox.id
                }))
              ]}
              placeholder="All mailboxes"
              value={mailboxFilter.value}
              {...(mailboxFilter.open === undefined ? {} : { open: mailboxFilter.open })}
              {...(mailboxFilter.onOpenChange ? { onOpenChange: mailboxFilter.onOpenChange } : {})}
              onValueChange={mailboxFilter.onChange}
            />
          </Field>
        </FieldGroup>
      ) : null}
      <nav aria-label="Mail folders" className="flex min-h-0 flex-1 flex-col gap-0.5">
        <span className="mb-1 px-3.5 text-[10px] font-medium uppercase tracking-[0.12em] text-tertiary">
          Your mail
        </span>
        {navigationFolders.map((folder) => {
          const Icon = icons[folder.id as keyof typeof icons];
          if (!Icon) return null;
          const unreadCount =
            folder.id === "inbox"
              ? inboxUnreadForMailbox(unread, mailboxId)
              : folder.id === "catchall"
                ? unread.catchall
                : 0;
          const count = folder.id === "drafts" ? draftCount : unreadCount;
          return (
            <Button
              asChild
              className={cn(
                "h-8 justify-start gap-3 rounded-[16px] px-3.5 text-[13px] font-medium leading-none text-muted-foreground dark:font-normal [&_svg]:size-4 [&_svg]:shrink-0",
                isDrawer && "h-11 rounded-[16px] text-sm",
                activeFolder === folder.id &&
                  "bg-selected text-foreground [@media(hover:hover)]:hover:bg-selected"
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
                <Icon className="translate-y-px" />
                <span className="min-w-0 flex-1 truncate leading-none">{folder.label}</span>
                {count > 0 ? (
                  <span className="ml-auto -translate-y-px font-mono text-[11px] leading-none tabular-nums text-foreground">
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
      </nav>
    </>
  );
}

export function ContactsNav({
  isDrawer,
  onFolderChange,
  onCompose
}: {
  isDrawer: boolean;
  onFolderChange: (folder: FolderId) => void;
  onCompose: (() => void) | undefined;
}): React.ReactElement {
  return (
    <>
      {onCompose ? (
        <Button
          className="btn-liquid-glass mb-4 h-10 w-full justify-start gap-3 rounded-full px-3.5 text-sm font-medium"
          onClick={onCompose}
          type="button"
          variant="ghost"
        >
          <PiNotePencil className="size-4" />
          <span className="leading-none">New email</span>
        </Button>
      ) : null}
      <nav aria-label="Contacts navigation" className="flex min-h-0 flex-1 flex-col gap-0.5">
        <span className="mb-1 px-3.5 text-[10px] font-medium uppercase tracking-[0.12em] text-tertiary">
          Contacts
        </span>
        <Button
          asChild
          className={cn(
            "h-8 justify-start gap-3 rounded-[16px] bg-selected px-3.5 text-[13px] font-medium leading-none text-foreground [@media(hover:hover)]:hover:bg-selected dark:font-normal [&_svg]:size-4 [&_svg]:shrink-0",
            isDrawer && "h-11 rounded-[16px] text-sm"
          )}
          variant="ghost"
        >
          <a
            aria-current="page"
            data-navigation-item
            href={appRoutePath({ kind: "contacts", contactId: null })}
            onClick={(event) => {
              if (isModifiedNavigation(event)) return;
              event.preventDefault();
              onFolderChange("contacts");
            }}
          >
            <PiAddressBook />
            <span className="min-w-0 flex-1 truncate leading-none">All contacts</span>
          </a>
        </Button>
      </nav>
    </>
  );
}

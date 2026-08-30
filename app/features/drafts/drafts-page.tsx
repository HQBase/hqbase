import type * as React from "react";
import { PiNotePencil, PiPaperclip } from "react-icons/pi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LabelFilter, LabelMenu, LabelStack } from "@/features/labels/label-controls";
import type { MailLabel } from "@/features/labels/types";
import { groupDrafts } from "@/features/messages/conversation-display";
import { MailListHeader, mailListRowClassName } from "@/features/messages/mail-list-layout";
import { cn } from "@/lib/cn";
import { formatConversationTimestamp } from "@/lib/format";
import { appRoutePath } from "@/lib/routes";

import type { Draft } from "./types";

type DraftsPageProps = {
  drafts: Draft[];
  isLoading: boolean;
  labelIds: readonly string[];
  labels: MailLabel[];
  mailboxId: string;
  search: string;
  selectedId: string | null;
  onBack: () => void;
  onLabelChange: (labelIds: string[]) => void;
  onSelect: (draftId: string) => void;
  onToggleLabel: (draftId: string, label: MailLabel, assigned: boolean) => Promise<void> | void;
};

export function DraftsPage({
  drafts,
  isLoading,
  labelIds,
  labels,
  mailboxId,
  search,
  selectedId,
  onBack,
  onLabelChange,
  onSelect,
  onToggleLabel
}: DraftsPageProps): React.ReactElement {
  const normalizedSearch = search.trim().toLowerCase();
  const visibleDrafts = drafts.filter((draft) => {
    if (mailboxId !== "all" && draft.mailboxId !== mailboxId) return false;
    if (!labelIds.every((id) => draft.labels.some((label) => label.id === id))) return false;
    if (!normalizedSearch) return true;
    return [draft.from, ...draft.to, ...draft.cc, ...draft.bcc, draft.subject, draft.text].some(
      (value) => value.toLowerCase().includes(normalizedSearch)
    );
  });
  const selectedDraft = selectedId ? drafts.find((draft) => draft.id === selectedId) : null;
  const draftsCountLabel =
    visibleDrafts.length === 1 ? "1 draft" : `${visibleDrafts.length.toLocaleString()} drafts`;

  if (selectedId && !selectedDraft && !isLoading) {
    return (
      <div className="flex h-full flex-col bg-list">
        <MailListHeader
          actions={<LabelFilter labels={labels} values={labelIds} onChange={onLabelChange} />}
          countLabel={draftsCountLabel}
          title="Drafts"
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex size-9 items-center justify-center rounded-md border border-divider bg-reader text-muted-foreground">
            <PiNotePencil className="size-4" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-medium">Draft not found</h2>
            <p className="text-xs text-muted-foreground">
              It may have been sent or discarded in another session.
            </p>
          </div>
          <Button size="sm" type="button" variant="outline" onClick={onBack}>
            Back to drafts
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading && drafts.length === 0) {
    return (
      <div className="flex h-full flex-col bg-list">
        <MailListHeader
          actions={<LabelFilter labels={labels} values={labelIds} onChange={onLabelChange} />}
          countLabel={draftsCountLabel}
          title="Drafts"
        />
        <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
          <Spinner />
        </div>
      </div>
    );
  }

  const groups = groupDrafts(visibleDrafts);

  return (
    <div className="flex h-full flex-col bg-list" data-mobile-view="message-list">
      <MailListHeader
        actions={<LabelFilter labels={labels} values={labelIds} onChange={onLabelChange} />}
        countLabel={draftsCountLabel}
        title="Drafts"
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="h-full overflow-auto overscroll-contain [scrollbar-gutter:stable] will-change-transform"
          data-draft-list-scroll=""
        >
          {visibleDrafts.length === 0 ? (
            <div className="mx-auto w-full max-w-[960px] px-4 sm:px-6 lg:px-8">
              <EmptyDrafts filtered={drafts.length > 0} />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[960px] px-1 pb-5 sm:px-6 lg:px-8">
              {groups.map((group) => (
                <section
                  aria-labelledby={`draft-group-${group.key}`}
                  className="[&:not(:first-child)]:pt-1"
                  key={group.key}
                >
                  <h2
                    className="px-3 pb-1.5 pt-6 text-[13px] font-medium text-foreground sm:px-0"
                    id={`draft-group-${group.key}`}
                  >
                    {group.label}
                  </h2>
                  <div className="flex flex-col gap-0.5">
                    {group.drafts.map((draft) => (
                      <DraftListItem
                        draft={draft}
                        isActive={draft.id === selectedId}
                        labels={labels}
                        key={draft.id}
                        onSelect={onSelect}
                        onToggleLabel={(label, assigned) =>
                          onToggleLabel(draft.id, label, assigned)
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftListItem({
  draft,
  isActive,
  labels,
  onSelect,
  onToggleLabel
}: {
  draft: Draft;
  isActive: boolean;
  labels: MailLabel[];
  onSelect: (draftId: string) => void;
  onToggleLabel: (label: MailLabel, assigned: boolean) => Promise<void> | void;
}): React.ReactElement {
  const recipients = draft.to.length > 0 ? draft.to.join(", ") : "No recipients";
  const subject = draft.subject.trim() || "No subject";
  const snippet = draft.text.trim().replace(/\s+/g, " ") || "No message content";
  const attachmentCount = draft.attachments.filter((attachment) => !attachment.inline).length;
  const avatarInitial = recipients === "No recipients" ? "?" : recipients.charAt(0).toUpperCase();
  const labelContainerClass =
    "rounded-full bg-[hsl(var(--message-row-surface))] p-0.5 shadow-[-5px_0_5px_1px_hsl(var(--message-row-surface))] sm:shadow-[-8px_0_8px_2px_hsl(var(--message-row-surface))]";

  return (
    <a
      className={mailListRowClassName(isActive)}
      href={appRoutePath({ kind: "drafts", draftId: draft.id })}
      onClick={(event) => {
        if (isModifiedNavigation(event)) return;
        event.preventDefault();
        onSelect(draft.id);
      }}
    >
      <Avatar aria-hidden="true" className="row-span-2 size-10 sm:hidden">
        <AvatarFallback className="font-medium uppercase">{avatarInitial}</AvatarFallback>
      </Avatar>
      <span className="col-start-3 row-start-2 flex shrink-0 self-end justify-self-end sm:col-start-1 sm:row-start-1 sm:self-center sm:justify-self-auto">
        {labels.length > 0 ? (
          <LabelMenu
            assigned={draft.labels}
            className="sm:hidden"
            labels={labels}
            onToggle={onToggleLabel}
            showTagIcon
          />
        ) : null}
        <span
          aria-label="Draft"
          className={cn(
            "size-10 min-h-10 min-w-10 items-end justify-center pb-px text-tertiary sm:size-8 sm:min-h-8 sm:min-w-8 sm:items-center sm:pb-0",
            labels.length > 0 ? "hidden sm:flex" : "flex"
          )}
          role="img"
        >
          <PiNotePencil
            aria-hidden="true"
            className="pointer-events-none size-[18px] -translate-y-px sm:size-4 sm:translate-y-0"
          />
        </span>
      </span>
      <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-1 font-normal text-foreground/85 dark:text-white/65 sm:col-start-2 sm:row-start-1">
        <span className="min-w-0 truncate">{recipients}</span>
      </span>
      <span className="hidden items-center justify-center sm:col-start-3 sm:row-start-1 sm:flex">
        {attachmentCount > 0 ? (
          <PiPaperclip
            aria-label={`${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`}
            className="pointer-events-none size-3.5 shrink-0 text-tertiary"
          />
        ) : null}
      </span>
      <span className="col-start-2 row-start-2 flex min-w-0 items-end gap-2 overflow-hidden sm:col-start-4 sm:row-start-1 sm:h-8 sm:items-center">
        {attachmentCount > 0 ? (
          <PiPaperclip
            aria-label={`${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`}
            className="pointer-events-none size-3.5 shrink-0 self-center text-tertiary sm:hidden"
          />
        ) : null}
        <span className="min-w-0 flex-1 sm:mr-2 sm:overflow-hidden">
          <span className="block truncate font-normal text-foreground/85 dark:text-white/65 sm:inline">
            {subject}
          </span>
          <span className="block truncate text-muted-foreground sm:inline">
            <span className="hidden sm:inline">{" — "}</span>
            {snippet}
          </span>
        </span>
      </span>
      {draft.labels.length > 0 ? (
        <span
          className={cn(
            "col-start-2 row-start-2 z-10 flex w-max items-center justify-end self-end justify-self-end overflow-visible sm:hidden",
            labelContainerClass
          )}
          data-message-labels="compact"
        >
          <LabelStack
            className="w-max shrink-0 leading-4"
            compact
            labels={draft.labels}
            namedLimit={draft.labels.length}
          />
        </span>
      ) : null}
      {labels.length > 0 ? (
        <LabelMenu
          assigned={draft.labels}
          className={cn(
            "z-10 hidden max-w-[75%] justify-self-end overflow-hidden [@media(hover:hover)]:hover:bg-[hsl(var(--message-row-surface))] [@media(hover:hover)]:hover:text-foreground/80 sm:col-start-4 sm:row-start-1 sm:inline-flex",
            labelContainerClass
          )}
          labels={labels}
          onToggle={onToggleLabel}
          showAssignedLabels
          showTagIcon
        />
      ) : null}
      <span className="hidden min-w-0 items-center justify-center sm:col-start-5 sm:row-start-1 sm:flex sm:w-7 sm:min-w-7" />
      <time
        className="col-start-3 row-start-1 shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-muted-foreground sm:col-start-6 sm:row-start-1 sm:text-[12px]"
        dateTime={draft.updatedAt}
      >
        {formatConversationTimestamp(draft.updatedAt)}
      </time>
    </a>
  );
}

function EmptyDrafts({ filtered }: { filtered: boolean }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <div className="flex size-9 items-center justify-center rounded-md border border-divider bg-reader">
        <PiNotePencil className="size-4" />
      </div>
      <div className="text-xs">{filtered ? "No drafts match this view" : "No saved drafts"}</div>
    </div>
  );
}

function isModifiedNavigation(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

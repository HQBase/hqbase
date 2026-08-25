import type * as React from "react";
import { PiNotePencil, PiPaperclip } from "react-icons/pi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { groupDrafts } from "@/features/messages/conversation-display";
import { cn } from "@/lib/cn";
import { formatConversationTimestamp } from "@/lib/format";
import { appRoutePath } from "@/lib/routes";

import type { Draft } from "./types";

type DraftsPageProps = {
  drafts: Draft[];
  isLoading: boolean;
  mailboxId: string;
  search: string;
  selectedId: string | null;
  onBack: () => void;
  onSelect: (draftId: string) => void;
};

export function DraftsPage({
  drafts,
  isLoading,
  mailboxId,
  search,
  selectedId,
  onBack,
  onSelect
}: DraftsPageProps): React.ReactElement {
  const normalizedSearch = search.trim().toLowerCase();
  const visibleDrafts = drafts.filter((draft) => {
    if (mailboxId !== "all" && draft.mailboxId !== mailboxId) return false;
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
        <div className="flex h-11 shrink-0 items-center border-b border-divider bg-toolbar">
          <div className="mx-auto flex w-full max-w-[960px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <span className="text-sm font-medium text-foreground">Drafts</span>
            <span className="text-[12px] tabular-nums text-tertiary">{draftsCountLabel}</span>
          </div>
        </div>
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
        <div className="flex h-11 shrink-0 items-center border-b border-divider bg-toolbar">
          <div className="mx-auto flex w-full max-w-[960px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <span className="text-sm font-medium text-foreground">Drafts</span>
            <span className="text-[12px] tabular-nums text-tertiary">{draftsCountLabel}</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
          <Spinner />
        </div>
      </div>
    );
  }

  const groups = groupDrafts(visibleDrafts);

  return (
    <div className="flex h-full flex-col bg-list" data-mobile-view="message-list">
      <div className="flex h-11 shrink-0 items-center border-b border-divider bg-toolbar">
        <div className="mx-auto flex w-full max-w-[960px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <span className="text-sm font-medium text-foreground">Drafts</span>
          <span className="text-[12px] tabular-nums text-tertiary">{draftsCountLabel}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-auto overscroll-contain will-change-transform">
          {visibleDrafts.length === 0 ? (
            <div className="mx-auto w-full max-w-[960px] px-4 sm:px-6 lg:px-8">
              <EmptyDrafts filtered={drafts.length > 0} />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[960px] px-4 pb-5 sm:px-6 lg:px-8">
              {groups.map((group) => (
                <section
                  aria-labelledby={`draft-group-${group.key}`}
                  className="[&:not(:first-child)]:pt-1"
                  key={group.key}
                >
                  <h2
                    className="pb-1.5 pt-6 text-[13px] font-medium text-foreground"
                    id={`draft-group-${group.key}`}
                  >
                    {group.label}
                  </h2>
                  <div className="flex flex-col gap-0.5">
                    {group.drafts.map((draft) => (
                      <DraftListItem
                        draft={draft}
                        isActive={draft.id === selectedId}
                        key={draft.id}
                        onSelect={onSelect}
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
  onSelect
}: {
  draft: Draft;
  isActive: boolean;
  onSelect: (draftId: string) => void;
}): React.ReactElement {
  const recipients = draft.to.length > 0 ? draft.to.join(", ") : "No recipients";
  const subject = draft.subject.trim() || "No subject";
  const snippet = draft.text.trim().replace(/\s+/g, " ") || "No message content";
  const attachmentCount = draft.attachments.filter((attachment) => !attachment.inline).length;

  return (
    <a
      className={cn(
        "group flex w-full items-center gap-4 rounded-xl px-3 py-2 text-left text-[13px] leading-5 transition-colors [@media(hover:hover)]:hover:bg-hover focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        isActive && "bg-selected"
      )}
      href={appRoutePath({ kind: "drafts", draftId: draft.id })}
      onClick={(event) => {
        if (isModifiedNavigation(event)) return;
        event.preventDefault();
        onSelect(draft.id);
      }}
    >
      <span className="flex h-10 min-h-10 w-11 min-w-11 shrink-0 items-center justify-center">
        <Badge className="h-5 shrink-0 border-transparent bg-[oklch(0.65_0.22_25/0.14)] px-1.5 text-[10px] text-[oklch(0.61_0.20_25)] dark:bg-white/[0.07] dark:text-[oklch(0.70_0.20_25)] dark:border-white/[0.07]">
          Draft
        </Badge>
      </span>
      <span className="flex w-[30%] min-w-0 max-w-[16rem] shrink-0 items-center gap-2">
        <span className="min-w-0 truncate text-[13px] font-normal text-muted-foreground">
          {recipients}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground dark:text-white">{subject}</span>
          <span className="text-muted-foreground">
            {" — "}
            {snippet}
          </span>
        </span>
        {attachmentCount > 0 ? (
          <PiPaperclip
            aria-label={`${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`}
            className="pointer-events-none size-3.5 shrink-0 text-tertiary"
          />
        ) : null}
      </span>
      <time
        className="w-[5.75rem] shrink-0 text-right text-[12px] tabular-nums text-muted-foreground"
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

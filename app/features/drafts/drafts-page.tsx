import { FilePenLine, Paperclip } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
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

  return (
    <section className="flex h-full min-h-0 flex-col bg-card/35">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h1 className="text-sm font-medium">Drafts</h1>
        <span className="font-mono text-[11px] text-muted-foreground">{visibleDrafts.length}</span>
      </div>
      {selectedId && !selectedDraft && !isLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <FilePenLine className="size-4" />
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
      ) : isLoading && drafts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Spinner />
        </div>
      ) : visibleDrafts.length === 0 ? (
        <EmptyDrafts filtered={drafts.length > 0} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {visibleDrafts.map((draft) => (
            <DraftListItem
              draft={draft}
              isActive={draft.id === selectedId}
              key={draft.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
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

  return (
    <a
      className={cn(
        "grid min-h-14 w-full grid-cols-[minmax(8rem,0.7fr)_minmax(0,2fr)_auto] items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left transition-colors hover:bg-muted/55 max-sm:grid-cols-[minmax(0,1fr)_auto]",
        isActive && "bg-muted/85"
      )}
      href={appRoutePath({ kind: "drafts", draftId: draft.id })}
      onClick={(event) => {
        if (isModifiedNavigation(event)) return;
        event.preventDefault();
        onSelect(draft.id);
      }}
    >
      <div className="min-w-0 truncate text-[13px]">
        <span className="font-medium text-destructive">Draft</span>
        <span className="ml-2 text-muted-foreground">{recipients}</span>
      </div>
      <div className="flex min-w-0 items-center gap-2 max-sm:col-span-2 max-sm:row-start-2">
        <span className="shrink-0 truncate text-[13px] font-medium">{subject}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <span className="truncate text-[12px] text-muted-foreground">{snippet}</span>
        {draft.attachments.length > 0 ? (
          <Paperclip
            aria-label={`${draft.attachments.length} attachment${draft.attachments.length === 1 ? "" : "s"}`}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        ) : null}
      </div>
      <time
        className="shrink-0 font-mono text-[10px] text-muted-foreground max-sm:col-start-2 max-sm:row-start-1"
        dateTime={draft.updatedAt}
      >
        {formatDateTime(draft.updatedAt)}
      </time>
    </a>
  );
}

function EmptyDrafts({ filtered }: { filtered: boolean }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <div className="flex size-9 items-center justify-center rounded-md border bg-card">
        <FilePenLine className="size-4" />
      </div>
      <div className="text-xs">{filtered ? "No drafts match this view" : "No saved drafts"}</div>
    </div>
  );
}

function isModifiedNavigation(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

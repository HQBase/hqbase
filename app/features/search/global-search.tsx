import * as React from "react";
import type { IconType } from "react-icons";
import {
  PiAddressBook,
  PiFileText,
  PiMagnifyingGlass,
  PiMapPin,
  PiPaperPlaneTilt
} from "react-icons/pi";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

import { searchWorkspace } from "./api";
import {
  type GlobalSearchGroup,
  type GlobalSearchResult,
  groupSearchResults,
  type WorkspaceSearchResults
} from "./types";

const emptyResults: WorkspaceSearchResults = {
  contacts: [],
  conversations: [],
  destinations: [],
  drafts: []
};

type GlobalSearchProps = {
  className?: string | undefined;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (result: GlobalSearchResult) => void;
  onSubmit: (query: string) => void;
};

export function GlobalSearch({
  className,
  query,
  onQueryChange,
  onSelect,
  onSubmit
}: GlobalSearchProps): React.ReactElement {
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState<WorkspaceSearchResults>(emptyResults);
  const [status, setStatus] = React.useState<"error" | "idle" | "loading" | "ready">("idle");
  const listId = React.useId();
  const requestId = React.useRef(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const groups = React.useMemo(() => groupSearchResults(results), [results]);
  const flatResults = React.useMemo(() => groups.flatMap((group) => group.results), [groups]);
  const trimmedQuery = query.trim();
  const listOpen = open && trimmedQuery.length > 0;

  React.useEffect(() => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setActiveIndex(-1);
    setResults(emptyResults);
    if (!trimmedQuery) {
      setStatus("idle");
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    const timer = window.setTimeout(() => {
      void searchWorkspace(trimmedQuery, { limit: 5, signal: controller.signal })
        .then((nextResults) => {
          if (requestId.current !== currentRequest) return;
          setResults(nextResults);
          setStatus("ready");
        })
        .catch((error: unknown) => {
          if (requestId.current !== currentRequest || controller.signal.aborted) return;
          setStatus(error instanceof Error && error.name === "AbortError" ? "idle" : "error");
        });
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  function choose(result: GlobalSearchResult): void {
    setOpen(false);
    setActiveIndex(-1);
    onSelect(result);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" && flatResults.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % flatResults.length);
      return;
    }
    if (event.key === "ArrowUp" && flatResults.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? flatResults.length - 1 : current - 1));
      return;
    }
    if (event.key === "Escape" && listOpen) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key !== "Enter" || !trimmedQuery) return;
    event.preventDefault();
    const selected = listOpen && activeIndex >= 0 ? flatResults[activeIndex] : undefined;
    if (selected) choose(selected);
    else {
      setOpen(false);
      setActiveIndex(-1);
      onSubmit(trimmedQuery);
    }
  }

  return (
    <div className={cn("relative min-w-0 max-w-xl flex-1", className)} ref={rootRef}>
      <PiMagnifyingGlass
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-4 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-activedescendant={
          listOpen && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={listOpen ? listId : undefined}
        aria-expanded={listOpen}
        aria-label="Search HQBase"
        autoComplete="off"
        className="h-8 border-transparent bg-muted/70 pl-8 text-xs shadow-none focus-visible:border-input focus-visible:ring-1"
        maxLength={200}
        placeholder="Search HQBase"
        role="combobox"
        spellCheck={false}
        value={query}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
        onChange={(event) => {
          setActiveIndex(-1);
          setOpen(event.target.value.trim().length > 0);
          onQueryChange(event.target.value);
        }}
        onFocus={() => {
          if (trimmedQuery) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {listOpen ? (
        <div
          aria-busy={status === "loading"}
          className="absolute inset-x-0 top-10 z-50 max-h-[min(32rem,calc(100dvh-4rem))] touch-pan-y overflow-y-auto rounded-xl border border-divider bg-popover p-1.5 text-popover-foreground shadow-xl"
          id={listId}
          role="listbox"
        >
          {groups.length > 0 ? (
            <SearchGroups
              activeIndex={activeIndex}
              groups={groups}
              listId={listId}
              onChoose={choose}
              onHighlight={setActiveIndex}
            />
          ) : (
            <p className="px-3 py-5 text-center text-xs text-muted-foreground" role="status">
              {status === "loading"
                ? "Searching…"
                : status === "error"
                  ? "Search is unavailable. Press Enter to search Inbox."
                  : "No results. Press Enter to search Inbox."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SearchGroups({
  activeIndex,
  groups,
  listId,
  onChoose,
  onHighlight
}: {
  activeIndex: number;
  groups: GlobalSearchGroup[];
  listId: string;
  onChoose: (result: GlobalSearchResult) => void;
  onHighlight: (index: number) => void;
}): React.ReactElement {
  let index = -1;
  return (
    <>
      {groups.map((group) => (
        <fieldset
          aria-labelledby={`${listId}-${group.id}`}
          className="min-w-0 border-0 p-0"
          key={group.id}
        >
          <p
            className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-tertiary first:pt-1"
            id={`${listId}-${group.id}`}
          >
            {group.label}
          </p>
          {group.results.map((result) => {
            index += 1;
            const resultIndex = index;
            return (
              <SearchOption
                active={resultIndex === activeIndex}
                id={`${listId}-option-${resultIndex}`}
                key={`${result.kind}:${result.id}`}
                result={result}
                onChoose={onChoose}
                onHighlight={() => onHighlight(resultIndex)}
              />
            );
          })}
        </fieldset>
      ))}
    </>
  );
}

function SearchOption({
  active,
  id,
  result,
  onChoose,
  onHighlight
}: {
  active: boolean;
  id: string;
  result: GlobalSearchResult;
  onChoose: (result: GlobalSearchResult) => void;
  onHighlight: () => void;
}): React.ReactElement {
  const presentation = resultPresentation(result);
  const Icon = presentation.icon;
  return (
    <button
      aria-selected={active}
      className={cn(
        "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs outline-none",
        active ? "bg-selected text-foreground" : "text-muted-foreground hover:bg-muted/70"
      )}
      id={id}
      role="option"
      tabIndex={-1}
      type="button"
      onClick={() => onChoose(result)}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onHighlight}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{presentation.primary}</span>
        <span className="block truncate text-[11px]">{presentation.secondary}</span>
      </span>
    </button>
  );
}

function resultPresentation(result: GlobalSearchResult): {
  icon: IconType;
  primary: string;
  secondary: string;
} {
  switch (result.kind) {
    case "conversation":
      return {
        icon: PiPaperPlaneTilt,
        primary: result.subject || "(No subject)",
        secondary: `${result.fromAddress}${result.snippet ? ` · ${result.snippet}` : ""}`
      };
    case "contact":
      return {
        icon: PiAddressBook,
        primary: result.name || result.email,
        secondary: result.name ? result.email : contactSourceLabel(result.source)
      };
    case "draft":
      return {
        icon: PiFileText,
        primary: result.subject || "(No subject)",
        secondary: result.to.length > 0 ? `Draft to ${result.to.join(", ")}` : "Draft"
      };
    case "destination":
      return { icon: PiMapPin, primary: result.label, secondary: result.description };
  }
}

function contactSourceLabel(source: "mailbox" | "recent" | "saved"): string {
  if (source === "saved") return "Saved contact";
  if (source === "mailbox") return "Mailbox";
  return "Recent correspondent";
}

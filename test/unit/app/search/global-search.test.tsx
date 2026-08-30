// @vitest-environment happy-dom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalSearch } from "@/features/search/global-search";
import {
  type GlobalSearchResult,
  globalSearchResultPath,
  type WorkspaceSearchResults
} from "@/features/search/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const mocks = vi.hoisted(() => ({ searchWorkspace: vi.fn() }));
vi.mock("@/features/search/api", () => ({ searchWorkspace: mocks.searchWorkspace }));

const emptyResults: WorkspaceSearchResults = {
  contacts: [],
  conversations: [],
  destinations: [],
  drafts: []
};

describe("global search", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("debounces requests, ignores stale results, and opens a keyboard result", async () => {
    vi.useFakeTimers();
    let resolveOld: ((results: WorkspaceSearchResults) => void) | undefined;
    mocks.searchWorkspace.mockImplementation((query: string) => {
      if (query === "old") {
        return new Promise<WorkspaceSearchResults>((resolve) => {
          resolveOld = resolve;
        });
      }
      return Promise.resolve({
        ...emptyResults,
        destinations: [
          { description: "Settings", id: "labels", label: "Labels", path: "/settings/labels" }
        ]
      });
    });
    const onSelect = vi.fn<(result: GlobalSearchResult) => void>();
    const view = await renderComponent(
      <SearchHost onSelect={onSelect} onSubmit={() => undefined} />
    );
    const input = requiredInput(view.container);
    expect(input.className).toContain("h-[30px]");
    expect(input.className).not.toContain("focus-visible:ring");
    expect(input.className).not.toContain("focus-visible:border-input");

    await setInput(input, "old");
    await flushHookEffects(() => vi.advanceTimersByTime(200));
    expect(mocks.searchWorkspace).toHaveBeenCalledWith(
      "old",
      expect.objectContaining({ limit: 5, signal: expect.any(AbortSignal) })
    );

    await setInput(input, "labels");
    await flushHookEffects(() => vi.advanceTimersByTime(200));
    expect(view.container.querySelector('[role="option"]')?.textContent).toContain("Labels");

    await flushHookEffects(() => resolveOld?.(emptyResults));
    expect(view.container.querySelector('[role="option"]')?.textContent).toContain("Labels");

    await flushHookEffects(() =>
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }))
    );
    expect(input.getAttribute("aria-activedescendant")).toContain("option-0");
    await flushHookEffects(() =>
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }))
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "destination", path: "/settings/labels" })
    );
    await view.unmount();
  });

  it("submits an Inbox search when Enter has no active result", async () => {
    vi.useFakeTimers();
    mocks.searchWorkspace.mockResolvedValue(emptyResults);
    const onSubmit = vi.fn();
    const view = await renderComponent(
      <SearchHost onSelect={() => undefined} onSubmit={onSubmit} />
    );
    const input = requiredInput(view.container);

    await setInput(input, "  exact query  ");
    await flushHookEffects(() =>
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }))
    );

    expect(onSubmit).toHaveBeenCalledWith("exact query");
    expect(mocks.searchWorkspace).not.toHaveBeenCalled();

    await setInput(input, "");
    await flushHookEffects(() =>
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }))
    );
    expect(onSubmit).toHaveBeenLastCalledWith("");
    await view.unmount();
  });

  it("clears a non-empty query and keeps focus in the search field", async () => {
    mocks.searchWorkspace.mockResolvedValue(emptyResults);
    const view = await renderComponent(
      <SearchHost onSelect={() => undefined} onSubmit={() => undefined} />
    );
    const input = requiredInput(view.container);

    expect(view.container.querySelector('[aria-label="Clear search"]')).toBeNull();
    await setInput(input, "hello");
    const clear = view.container.querySelector<HTMLButtonElement>('[aria-label="Clear search"]');
    const focus = vi.spyOn(input, "focus");
    expect(clear).not.toBeNull();
    expect(clear?.className).not.toContain("focus-visible:ring");

    await flushHookEffects(() => clear?.click());

    expect(input.value).toBe("");
    expect(focus).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[aria-label="Clear search"]')).toBeNull();
    await view.unmount();
  });

  it("builds canonical paths for selectable results", () => {
    expect(
      globalSearchResultPath({
        kind: "contact",
        email: "pat+search@example.net",
        id: "pat+search@example.net",
        lastContactAt: null,
        name: "Pat",
        saved: true,
        source: "saved"
      })
    ).toBe("/contacts/pat%2Bsearch%40example.net");
    expect(
      globalSearchResultPath({
        kind: "draft",
        from: "team@example.com",
        id: "draft/one",
        subject: "Draft",
        to: [],
        updatedAt: "2026-08-24T00:00:00.000Z"
      })
    ).toBe("/mail/drafts/draft%2Fone");
  });
});

function SearchHost({
  onSelect,
  onSubmit
}: {
  onSelect: (result: GlobalSearchResult) => void;
  onSubmit: (query: string) => void;
}): React.ReactElement {
  const [query, setQuery] = React.useState("");
  return (
    <GlobalSearch query={query} onQueryChange={setQuery} onSelect={onSelect} onSubmit={onSubmit} />
  );
}

function requiredInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('[role="combobox"]');
  if (!input) throw new Error("Expected global search input.");
  return input;
}

async function setInput(input: HTMLInputElement, value: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await flushHookEffects(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

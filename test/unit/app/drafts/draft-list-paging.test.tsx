// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { DraftsPage } from "@/features/drafts/drafts-page";
import type { Draft } from "@/features/drafts/types";
import { flushHookEffects, renderComponent } from "../render-hook";

it("pages draft rows and searches the complete synchronized set", async () => {
  const drafts = Array.from(
    { length: 125 },
    (_, index) =>
      ({
        id: `draft-${index}`,
        mailboxId: "mailbox",
        from: "owner@example.test",
        to: [],
        cc: [],
        bcc: [],
        subject: `Draft ${index}`,
        text: "Synthetic body",
        labels: [],
        attachments: [],
        updatedAt: "2026-09-04T12:00:00Z"
      }) as unknown as Draft
  );
  const onSelect = vi.fn();
  const props = {
    drafts,
    isLoading: false,
    labelIds: [],
    labels: [],
    mailboxId: "all",
    search: "",
    selectedId: null,
    onBack: vi.fn(),
    onLabelChange: vi.fn(),
    onSelect,
    onToggleLabel: vi.fn()
  };
  const view = await renderComponent(<DraftsPage {...props} />);
  try {
    expect(view.container.querySelectorAll("a")).toHaveLength(50);
    const more = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Load more drafts"
    );
    await flushHookEffects(() => more?.click());
    expect(view.container.querySelectorAll("a")).toHaveLength(100);
    await view.rerender(<DraftsPage {...props} search="Draft 124" />);
    expect(view.container.querySelectorAll("a")).toHaveLength(1);
    await flushHookEffects(() => view.container.querySelector("a")?.click());
    expect(onSelect).toHaveBeenCalledWith("draft-124");
  } finally {
    await view.unmount();
  }
});

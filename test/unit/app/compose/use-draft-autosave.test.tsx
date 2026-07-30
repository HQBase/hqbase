// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { useDraftAutosave } from "@/features/compose/use-draft-autosave";
import type { Draft } from "@/features/drafts/types";
import { flushHookEffects, renderHook } from "../render-hook";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  updateDraft: vi.fn()
}));

vi.mock("@/features/drafts/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/drafts/api")>()),
  updateDraft: mocks.updateDraft
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError }
}));

const draft: Draft = {
  id: "draft-1",
  mailboxId: "mailbox-1",
  replyToMessageId: null,
  forwardOfMessageId: null,
  from: "sender@example.com",
  to: ["reader@example.com"],
  cc: [],
  bcc: [],
  subject: "Original",
  text: "Original body",
  html: "<p>Original body</p>",
  version: 1,
  updatedAt: "2026-07-29T00:00:00.000Z",
  attachments: []
};

function options(overrides: Partial<Parameters<typeof useDraftAutosave>[0]> = {}) {
  return {
    open: false,
    initialized: { current: true },
    draft,
    identities: [{ mailboxId: "mailbox-1", address: "sender@example.com" }],
    recoveryKey: "hqbase:draft-recovery:test",
    replyToMessageId: null,
    forwardOfMessageId: null,
    from: draft.from,
    to: draft.to.join(", "),
    cc: "",
    bcc: "",
    subject: draft.subject,
    text: draft.text,
    html: draft.html,
    setDraft: vi.fn(),
    setSaveState: vi.fn(),
    ...overrides
  };
}

describe("useDraftAutosave", () => {
  it("persists recovery state and saves the latest initialized draft after the debounce", async () => {
    vi.useFakeTimers();
    const nextDraft = { ...draft, subject: "Changed", version: 2 };
    mocks.updateDraft.mockResolvedValue(nextDraft);
    const initial = options();
    const hook = await renderHook(useDraftAutosave, initial);
    hook.result.initializeAutosave(draft);
    const changed = options({
      open: true,
      subject: "Changed",
      setDraft: initial.setDraft,
      setSaveState: initial.setSaveState
    });
    await hook.rerender(changed);

    expect(localStorage.getItem(initial.recoveryKey)).toContain('"subject":"Changed"');
    await flushHookEffects(() => {
      vi.advanceTimersByTime(800);
    });
    expect(mocks.updateDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        mailboxId: "mailbox-1",
        subject: "Changed",
        version: 1
      })
    );
    expect(changed.setDraft).toHaveBeenCalledWith(nextDraft);
    expect(changed.setSaveState).toHaveBeenLastCalledWith("saved");
    expect(localStorage.getItem(initial.recoveryKey)).toBeNull();

    await hook.unmount();
    vi.useRealTimers();
  });
});

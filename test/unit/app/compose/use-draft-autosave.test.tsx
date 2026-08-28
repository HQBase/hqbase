// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  signature: { mode: "automatic", id: null, name: "", html: "", text: "" },
  version: 1,
  updatedAt: "2026-07-29T00:00:00.000Z",
  attachments: [],
  labels: []
};

function options(overrides: Partial<Parameters<typeof useDraftAutosave>[0]> = {}) {
  return {
    open: false,
    initialized: { current: true },
    draft,
    identities: [{ mailboxId: "mailbox-1", address: "sender@example.com", displayName: "Sender" }],
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

function recovery(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    from: draft.from,
    to: draft.to.join(", "),
    cc: "",
    bcc: "",
    subject: draft.subject,
    text: draft.text,
    html: draft.html,
    savedAt: Date.now(),
    ...overrides
  });
}

describe("useDraftAutosave", () => {
  beforeEach(() => {
    mocks.toastError.mockReset();
    mocks.updateDraft.mockReset();
    localStorage.clear();
  });

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

  it("keeps an unfinished recipient local without dispatching repeated save errors", async () => {
    vi.useFakeTimers();
    const initial = options();
    const hook = await renderHook(useDraftAutosave, initial);
    hook.result.initializeAutosave(draft);
    const changed = options({
      open: true,
      subject: "Changed",
      to: "unfinished",
      setDraft: initial.setDraft,
      setSaveState: initial.setSaveState
    });
    await hook.rerender(changed);
    await flushHookEffects(() => vi.advanceTimersByTime(2_000));

    expect(localStorage.getItem(initial.recoveryKey)).toContain('"to":"unfinished"');
    expect(changed.setSaveState).toHaveBeenLastCalledWith("local");
    expect(mocks.updateDraft).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();

    await hook.unmount();
    vi.useRealTimers();
  });

  it("saves a signature choice through the same revision queue", async () => {
    const nextDraft = {
      ...draft,
      signature: { mode: "none" as const, id: null, name: "", html: "", text: "" },
      version: 2
    };
    mocks.updateDraft.mockResolvedValue(nextDraft);
    const initial = options();
    const hook = await renderHook(useDraftAutosave, initial);
    hook.result.initializeAutosave(draft);

    await hook.result.saveSignature({ mode: "none" });

    expect(mocks.updateDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({ signature: { mode: "none" }, version: 1 })
    );
    expect(initial.setDraft).toHaveBeenCalledWith(nextDraft);
    expect(initial.setSaveState).toHaveBeenLastCalledWith("saved");
    await hook.unmount();
  });

  it("saves a From change immediately with its matching mailbox", async () => {
    const nextDraft = {
      ...draft,
      from: "other@example.com",
      mailboxId: "mailbox-2",
      version: 2
    };
    mocks.updateDraft.mockResolvedValue(nextDraft);
    const initial = options({
      identities: [
        { mailboxId: "mailbox-1", address: "sender@example.com", displayName: "Sender" },
        { mailboxId: "mailbox-2", address: "other@example.com", displayName: "Other" }
      ]
    });
    localStorage.setItem(initial.recoveryKey, recovery({ from: "other@example.com" }));
    const hook = await renderHook(useDraftAutosave, initial);
    hook.result.initializeAutosave(draft);

    await hook.result.saveFrom("other@example.com");

    expect(mocks.updateDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        from: "other@example.com",
        mailboxId: "mailbox-2",
        version: 1
      })
    );
    expect(initial.setDraft).toHaveBeenCalledWith(nextDraft);
    expect(initial.setSaveState).toHaveBeenLastCalledWith("saved");
    expect(localStorage.getItem(initial.recoveryKey)).toBeNull();
    await hook.unmount();
  });

  it("keeps invalid recipients local while saving a signature snapshot", async () => {
    const nextDraft = {
      ...draft,
      signature: { mode: "none" as const, id: null, name: "", html: "", text: "" },
      version: 2
    };
    mocks.updateDraft.mockResolvedValue(nextDraft);
    const initial = options({ identities: [], to: "unfinished" });
    localStorage.setItem(initial.recoveryKey, "pending recovery");
    const hook = await renderHook(useDraftAutosave, initial);
    hook.result.initializeAutosave(draft);

    await hook.result.saveSignature({ mode: "none" });

    expect(mocks.updateDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        bcc: draft.bcc,
        cc: draft.cc,
        mailboxId: null,
        signature: { mode: "none" },
        to: draft.to
      })
    );
    expect(initial.setDraft).toHaveBeenCalledWith(nextDraft);
    expect(initial.setSaveState).toHaveBeenLastCalledWith("local");
    expect(localStorage.getItem(initial.recoveryKey)).toBe("pending recovery");
    await hook.unmount();
  });

  it("does not let an older queued save delete newer reopened recovery", async () => {
    vi.useFakeTimers();
    let finishSave: ((value: Draft) => void) | undefined;
    mocks.updateDraft.mockReturnValue(
      new Promise<Draft>((resolve) => {
        finishSave = resolve;
      })
    );
    const initial = options();
    const hook = await renderHook(useDraftAutosave, initial);
    hook.result.initializeAutosave(draft);
    const changed = options({
      open: true,
      subject: "Older queued edit",
      setDraft: initial.setDraft,
      setSaveState: initial.setSaveState
    });
    await hook.rerender(changed);
    await flushHookEffects(() => vi.advanceTimersByTime(800));

    const newerRecovery = recovery({ subject: "Newer reopened edit", savedAt: Date.now() + 1 });
    localStorage.setItem(initial.recoveryKey, newerRecovery);
    await flushHookEffects(() =>
      finishSave?.({ ...draft, subject: "Older queued edit", version: 2 })
    );

    expect(localStorage.getItem(initial.recoveryKey)).toBe(newerRecovery);

    await hook.unmount();
    vi.useRealTimers();
  });
});

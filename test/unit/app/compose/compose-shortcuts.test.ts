import { describe, expect, it, vi } from "vitest";

import {
  type ComposeShortcutEvent,
  submitComposeOnShortcut
} from "@/features/compose/compose-shortcuts";

function shortcutEvent(overrides: Partial<ComposeShortcutEvent> = {}): ComposeShortcutEvent {
  return {
    key: "Enter",
    metaKey: false,
    ctrlKey: false,
    repeat: false,
    nativeEvent: { isComposing: false },
    currentTarget: { requestSubmit: vi.fn() },
    preventDefault: vi.fn(),
    ...overrides
  };
}

describe("compose send shortcuts", () => {
  it("submits with Command+Enter", () => {
    const event = shortcutEvent({ metaKey: true });

    submitComposeOnShortcut(event, false);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.currentTarget.requestSubmit).toHaveBeenCalledOnce();
  });

  it("submits with Control+Enter", () => {
    const event = shortcutEvent({ ctrlKey: true });

    submitComposeOnShortcut(event, false);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.currentTarget.requestSubmit).toHaveBeenCalledOnce();
  });

  it("leaves ordinary Enter unchanged", () => {
    const event = shortcutEvent();

    submitComposeOnShortcut(event, false);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.currentTarget.requestSubmit).not.toHaveBeenCalled();
  });

  it("does not submit while sending is disabled", () => {
    const event = shortcutEvent({ metaKey: true });

    submitComposeOnShortcut(event, true);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.currentTarget.requestSubmit).not.toHaveBeenCalled();
  });
});

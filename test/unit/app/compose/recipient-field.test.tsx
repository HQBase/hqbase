// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  insertRecipient,
  RecipientField,
  recipientQuery
} from "@/features/compose/recipient-field";
import { flushHookEffects, renderComponent } from "../render-hook";

const mocks = vi.hoisted(() => ({ listRecipientSuggestions: vi.fn() }));

vi.mock("@/features/contacts/api", () => ({
  listRecipientSuggestions: mocks.listRecipientSuggestions
}));

describe("recipient field", () => {
  beforeEach(() => {
    mocks.listRecipientSuggestions.mockReset().mockResolvedValue([]);
  });

  it("searches only an unfinished active recipient and inserts a unique suggestion", () => {
    expect(recipientQuery("one@example.com")).toBe("");
    expect(recipientQuery("one@example.com, two@example.com")).toBe("");
    expect(recipientQuery("one@example.com, ali")).toBe("ali");
    expect(insertRecipient("one@example.com, ali", "alice@example.com")).toBe(
      "one@example.com, alice@example.com, "
    );
    expect(insertRecipient("ALICE@example.com, ali", "alice@example.com")).toBe(
      "ALICE@example.com, "
    );
  });

  it("shows an address error only after the field loses focus", async () => {
    const view = await renderComponent(
      <RecipientField label="To" value="unfinished" onChange={() => undefined} />
    );
    const input = view.container.querySelector<HTMLInputElement>('[aria-label="To"]');
    expect(input).not.toBeNull();
    expect(view.container.querySelector('[role="alert"]')).toBeNull();

    await flushHookEffects(() =>
      input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    );

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(
      "not valid: unfinished"
    );
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    await view.unmount();
  });

  it("loads and selects a keyboard suggestion", async () => {
    vi.useFakeTimers();
    mocks.listRecipientSuggestions.mockResolvedValue([
      {
        email: "support@example.com",
        id: "support@example.com",
        lastContactAt: null,
        name: "Support",
        saved: false,
        source: "mailbox"
      }
    ]);
    const onChange = vi.fn();
    const view = await renderComponent(
      <RecipientField autoFocus label="To" value="sup" onChange={onChange} />
    );
    const input = view.container.querySelector<HTMLInputElement>('[aria-label="To"]');
    await flushHookEffects(() =>
      input?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    );
    await flushHookEffects(() => vi.advanceTimersByTime(150));

    expect(mocks.listRecipientSuggestions).toHaveBeenCalledWith("sup", 5);
    expect(view.container.querySelector('[role="option"]')?.textContent).toContain(
      "Supportsupport@example.comMailbox"
    );
    await flushHookEffects(() =>
      input?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }))
    );
    expect(onChange).toHaveBeenCalledWith("support@example.com, ");

    await view.unmount();
    vi.useRealTimers();
  });
});

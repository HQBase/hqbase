// @vitest-environment happy-dom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRecentAuthentication: vi.fn(),
  reauthenticate: vi.fn()
}));

vi.mock("@/features/auth/recent-authentication-api", () => ({
  getRecentAuthentication: mocks.getRecentAuthentication,
  reauthenticate: mocks.reauthenticate
}));

import { RecentAuthenticationGate } from "@/features/auth/recent-authentication";
import { flushHookEffects, renderComponent } from "../render-hook";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RecentAuthenticationGate", () => {
  it("shows checking, recent, and stale states", async () => {
    const checking = deferred<boolean>();
    mocks.getRecentAuthentication.mockReturnValueOnce(checking.promise);
    const checkingView = await renderGate();
    expect(checkingView.container.textContent).toContain("Checking sign-in…");
    checking.resolve(true);
    await flushHookEffects();
    expect(checkingView.container.querySelector("[data-ready]")).not.toBeNull();
    await checkingView.unmount();

    mocks.getRecentAuthentication.mockResolvedValueOnce(false);
    const staleView = await renderGate();
    await flushHookEffects();
    expect(staleView.container.textContent).toContain("Confirm your HQBase password to continue.");
    expect(staleView.container.querySelector('input[type="password"]')).not.toBeNull();
    await staleView.unmount();
  });

  it("stops a stalled check after ten seconds", async () => {
    vi.useFakeTimers();
    let checkSignal: AbortSignal | undefined;
    mocks.getRecentAuthentication.mockImplementationOnce((signal?: AbortSignal) => {
      checkSignal = signal;
      return new Promise<boolean>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true
        });
      });
    });
    const view = await renderGate();

    await flushHookEffects(() => vi.advanceTimersByTime(9_999));
    expect(view.container.textContent).toContain("Checking sign-in…");

    await flushHookEffects(() => vi.advanceTimersByTime(1));
    expect(checkSignal?.aborted).toBe(true);
    expect(view.container.querySelector('input[type="password"]')).not.toBeNull();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(
      "Your sign-in could not be confirmed. Try again."
    );
    await view.unmount();
  });

  it("shows a wrong-password error", async () => {
    mocks.getRecentAuthentication.mockResolvedValue(false);
    mocks.reauthenticate.mockRejectedValue(new Error("Password is incorrect."));
    const view = await renderGate();
    await flushHookEffects();

    await submitPassword(view.container, "wrong-password");

    expect(mocks.reauthenticate).toHaveBeenCalledWith("wrong-password");
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(
      "Password is incorrect."
    );
    expect(view.container.querySelector("[data-ready]")).toBeNull();
    expect(view.container.querySelector('input[type="password"]')).not.toBeNull();
    await view.unmount();
  });

  it("marks the gate ready and calls onAuthenticated once after a successful password", async () => {
    const onAuthenticated = vi.fn();
    mocks.getRecentAuthentication.mockResolvedValue(false);
    mocks.reauthenticate.mockResolvedValue(undefined);
    const view = await renderGate(onAuthenticated);
    await flushHookEffects();

    await submitPassword(view.container, "correct-password");

    expect(mocks.reauthenticate).toHaveBeenCalledWith("correct-password");
    expect(view.container.querySelector("[data-ready]")).not.toBeNull();
    expect(onAuthenticated).toHaveBeenCalledOnce();
    await flushHookEffects();
    expect(onAuthenticated).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it("keeps authentication recent when the continuation fails", async () => {
    mocks.getRecentAuthentication.mockResolvedValue(false);
    mocks.reauthenticate.mockResolvedValue(undefined);
    const onAuthenticated = vi.fn().mockRejectedValue(new Error("transition failed"));
    const readyAction = vi.fn();
    const view = await renderGate(
      onAuthenticated,
      <button data-ready type="button" onClick={readyAction}>
        Continue ready action
      </button>
    );
    await flushHookEffects();

    await submitPassword(view.container, "correct-password");

    expect(mocks.reauthenticate).toHaveBeenCalledWith("correct-password");
    expect(view.container.querySelector("[data-ready]")).not.toBeNull();
    expect(view.container.querySelector('input[type="password"]')).toBeNull();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(
      "Sign-in was confirmed, but the next action could not start. Try again."
    );
    await flushHookEffects(() => {
      view.container.querySelector<HTMLButtonElement>("[data-ready]")?.click();
    });
    expect(readyAction).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it("uses a unique password field ID for each gate", async () => {
    mocks.getRecentAuthentication.mockResolvedValue(false);
    const view = await renderComponent(
      <>
        <RecentAuthenticationGate
          active
          description="First protected action"
          layout="inline"
          ready={<div>First ready</div>}
        />
        <RecentAuthenticationGate
          active
          description="Second protected action"
          layout="inline"
          ready={<div>Second ready</div>}
        />
      </>
    );
    await flushHookEffects();
    const ids = [
      ...view.container.querySelectorAll<HTMLInputElement>('input[type="password"]')
    ].map((input) => input.id);
    expect(new Set(ids).size).toBe(2);
    await view.unmount();
  });

  it("cancels an old check and checks again when reactivated", async () => {
    const firstCheck = deferred<boolean>();
    let firstSignal: AbortSignal | undefined;
    mocks.getRecentAuthentication
      .mockImplementationOnce((signal?: AbortSignal) => {
        firstSignal = signal;
        return firstCheck.promise;
      })
      .mockResolvedValueOnce(true);
    let setActive: React.Dispatch<React.SetStateAction<boolean>> = () => undefined;

    function Harness(): React.ReactElement {
      const [active, updateActive] = React.useState(true);
      setActive = updateActive;
      return (
        <RecentAuthenticationGate
          active={active}
          description="Protected action"
          layout="inline"
          ready={<div data-ready>Ready</div>}
        />
      );
    }

    const view = await renderComponent(<Harness />);
    await flushHookEffects(() => setActive(false));
    expect(firstSignal?.aborted).toBe(true);
    firstCheck.resolve(true);
    await flushHookEffects();
    expect(view.container.querySelector("[data-ready]")).toBeNull();

    await flushHookEffects(() => setActive(true));
    expect(mocks.getRecentAuthentication).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector("[data-ready]")).not.toBeNull();
    await view.unmount();
  });
});

async function renderGate(
  onAuthenticated?: () => void | Promise<void>,
  ready: React.ReactNode = <div data-ready>Ready</div>
) {
  return renderComponent(
    <RecentAuthenticationGate
      active
      description="Protected action"
      layout="inline"
      ready={ready}
      {...(onAuthenticated ? { onAuthenticated } : {})}
    />
  );
}

async function submitPassword(container: HTMLElement, password: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[type="password"]');
  const form = container.querySelector("form");
  if (!input || !form) throw new Error("The recent-authentication form is missing.");
  await flushHookEffects(() => {
    setInputValue(input, password);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flushHookEffects(() => form.dispatchEvent(new Event("submit", { bubbles: true })));
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("The input value setter is unavailable.");
  setter.call(input, value);
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

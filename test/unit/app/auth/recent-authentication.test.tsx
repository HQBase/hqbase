// @vitest-environment happy-dom
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("cancels an old check and checks again when reactivated", async () => {
    const firstCheck = deferred<boolean>();
    mocks.getRecentAuthentication
      .mockReturnValueOnce(firstCheck.promise)
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
    firstCheck.resolve(true);
    await flushHookEffects();
    expect(view.container.querySelector("[data-ready]")).toBeNull();

    await flushHookEffects(() => setActive(true));
    expect(mocks.getRecentAuthentication).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector("[data-ready]")).not.toBeNull();
    await view.unmount();
  });
});

async function renderGate(onAuthenticated?: () => void) {
  return renderComponent(
    <RecentAuthenticationGate
      active
      description="Protected action"
      layout="inline"
      ready={<div data-ready>Ready</div>}
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

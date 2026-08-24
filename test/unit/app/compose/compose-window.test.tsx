// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComposeWindow } from "@/features/compose/compose-window";
import { flushHookEffects, renderComponent } from "../render-hook";

const desktopQuery = {
  matches: true,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
};

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => desktopQuery)
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    })
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: 680,
    height: 600,
    left: 500,
    right: 1_172,
    top: 80,
    width: 672,
    x: 500,
    y: 80,
    toJSON: () => ({})
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("compose window", () => {
  it("moves from its bottom-right desktop position by dragging the header", async () => {
    const view = await renderComponent(
      <ComposeWindow open status="Draft saved" title="New message" onOpenChange={() => undefined}>
        <div>Draft fields</div>
      </ComposeWindow>
    );
    await flushHookEffects();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const header = dialog?.querySelector<HTMLElement>("header");
    expect(dialog?.style.left).toBe("500px");
    expect(dialog?.style.top).toBe("80px");
    expect(dialog?.className).toContain("md:resize");
    expect(document.body.textContent).not.toContain("Expand compose");

    Object.assign(header ?? {}, {
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn()
    });
    await flushHookEffects(() => {
      header?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 600,
          clientY: 100,
          pointerId: 1
        })
      );
      header?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 550,
          clientY: 140,
          pointerId: 1
        })
      );
      header?.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 })
      );
    });

    expect(dialog?.style.left).toBe("450px");
    expect(dialog?.style.top).toBe("120px");
    await view.unmount();
  });
});

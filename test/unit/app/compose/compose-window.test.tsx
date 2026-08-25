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
    expect(dialog?.style.bottom).toBe("0px");
    expect(dialog?.style.right).toBe("16px");
    expect(dialog?.className).toContain("lg:resize");
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

  it("docks minimized composers side by side and does not drag them", async () => {
    const dock = document.createElement("div");
    dock.style.maxWidth = "320px";
    dock.style.overflowX = "auto";
    document.body.insertAdjacentElement("beforeend", dock);
    const view = await renderComponent(
      ["First", "Second", "Third", "Fourth"].map((title, index) => (
        <ComposeWindow
          dockIndex={index}
          dockTarget={dock}
          key={title}
          minimized
          open
          status="Draft saved"
          title={`${title} message`}
          onOpenChange={() => undefined}
        >
          <div>{title} draft</div>
        </ComposeWindow>
      ))
    );
    await flushHookEffects();

    const dialogs = dock.querySelectorAll<HTMLElement>('[role="dialog"]');
    expect(dialogs).toHaveLength(4);
    expect(dialogs[0]?.parentElement).toBe(dock);
    expect(dialogs[3]?.parentElement).toBe(dock);
    expect(dialogs[0]?.style.order).toBe("0");
    expect(dialogs[3]?.style.order).toBe("3");
    expect(dialogs[0]?.className).toContain("lg:resize-none");
    expect(dialogs[0]?.className).toContain("lg:relative");

    const header = dialogs[0]?.querySelector<HTMLElement>("header");
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
          clientX: 200,
          clientY: 200,
          pointerId: 1
        })
      );
    });

    expect(dialogs[0]?.style.order).toBe("0");
    expect(dialogs[0]?.style.left).toBe("");
    await view.unmount();
  });

  it("gives expanded composers distinct reachable title-bar slots", async () => {
    const view = await renderComponent(
      <>
        <ComposeWindow
          open
          status="Draft saved"
          title="Earlier message"
          windowSlot={1}
          onOpenChange={() => undefined}
        >
          <div>Earlier draft</div>
        </ComposeWindow>
        <ComposeWindow
          open
          status="Draft saved"
          title="Latest message"
          windowSlot={0}
          onOpenChange={() => undefined}
        >
          <div>Latest draft</div>
        </ComposeWindow>
      </>
    );
    await flushHookEffects();

    const dialogs = document.body.querySelectorAll<HTMLElement>('[role="dialog"]');
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0]?.style.bottom).toBe("56px");
    expect(dialogs[1]?.style.bottom).toBe("0px");
    expect(dialogs[0]?.style.right).toBe("16px");
    expect(dialogs[1]?.style.right).toBe("16px");

    const latestLayer = Number(dialogs[1]?.style.zIndex);
    dialogs[0]?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 9 }));
    await flushHookEffects();
    expect(Number(dialogs[0]?.style.zIndex)).toBeGreaterThan(latestLayer);
    await view.unmount();
  });
});

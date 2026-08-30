// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThreadComposeSurface } from "@/features/compose/thread-compose-surface";
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
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("thread compose surface", () => {
  it("scrolls and focuses after moving from parking into the conversation", async () => {
    const parkingTarget = document.createElement("div");
    parkingTarget.dataset.composerParking = "";
    const inlineTarget = document.createElement("div");
    document.body.insertAdjacentElement("beforeend", parkingTarget);
    document.body.insertAdjacentElement("beforeend", inlineTarget);
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => undefined);
    const surface = (target: HTMLElement) => (
      <ThreadComposeSurface
        formId="reply-form"
        inlineTarget={target}
        sendDisabled={false}
        status="Draft saved"
        title="Reply"
        onClose={() => undefined}
      >
        <textarea data-compose-autofocus />
      </ThreadComposeSurface>
    );
    const view = await renderComponent(surface(parkingTarget));
    await flushHookEffects();
    expect(scrollIntoView).not.toHaveBeenCalled();

    await view.rerender(surface(inlineTarget));
    await flushHookEffects();

    const editor = inlineTarget.querySelector<HTMLTextAreaElement>("[data-compose-autofocus]");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(document.activeElement).toBe(editor);
    await view.unmount();
  });
});

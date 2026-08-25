// @vitest-environment happy-dom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComposeSurface } from "@/features/compose/compose-surface";
import { flushHookEffects, renderComponent } from "../render-hook";

const desktopQuery = {
  matches: true,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
};

beforeEach(() => {
  desktopQuery.matches = true;
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

describe("compose surface", () => {
  it("keeps the editor body mounted while an image upload finishes across a route switch", async () => {
    let mounts = 0;
    let finishUpload: (() => void) | undefined;
    let resolveUpload: (() => void) | undefined;
    const upload = new Promise<void>((resolve) => {
      resolveUpload = resolve;
    });

    function PendingImageEditor(): React.ReactElement {
      const [images, setImages] = React.useState(0);
      React.useEffect(() => {
        mounts += 1;
      }, []);
      finishUpload = () => {
        void upload.then(() => setImages((current) => current + 1));
      };
      return (
        <div data-pending-image-editor>
          <input aria-label="Draft body" defaultValue="Unsaved body" />
          <button type="button" onClick={() => finishUpload?.()}>
            Upload image
          </button>
          <output>{images} images</output>
        </div>
      );
    }

    const inlineTarget = document.createElement("div");
    document.body.insertAdjacentElement("beforeend", inlineTarget);
    const surface = (presentation: "thread" | "window") => (
      <ComposeSurface
        dockIndex={0}
        dockTarget={null}
        formId="compose-form"
        inlineTarget={presentation === "thread" ? inlineTarget : null}
        open
        presentation={presentation}
        sendDisabled={false}
        status="Saving draft…"
        title="Reply"
        windowSlot={0}
        onOpenChange={() => undefined}
      >
        <PendingImageEditor />
      </ComposeSurface>
    );
    const view = await renderComponent(surface("thread"));
    await flushHookEffects();

    const input = document.body.querySelector<HTMLInputElement>('[aria-label="Draft body"]');
    if (input) input.value = "Changed during upload";
    await flushHookEffects(() =>
      document.body.querySelector<HTMLButtonElement>("[data-pending-image-editor] button")?.click()
    );

    await view.rerender(surface("window"));
    await flushHookEffects(() => resolveUpload?.());

    expect(mounts).toBe(1);
    expect(document.body.querySelector<HTMLInputElement>('[aria-label="Draft body"]')?.value).toBe(
      "Changed during upload"
    );
    expect(document.body.querySelector("[data-pending-image-editor] output")?.textContent).toBe(
      "1 images"
    );

    await view.unmount();
  });

  it("parks a compact inline composer instead of showing it on another route", async () => {
    desktopQuery.matches = false;
    let mounts = 0;

    function Editor(): React.ReactElement {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return <input aria-label="Draft body" defaultValue="Unsaved body" />;
    }

    const inlineTarget = document.createElement("div");
    const parkingTarget = document.createElement("div");
    parkingTarget.dataset.composerParking = "";
    parkingTarget.hidden = true;
    document.body.appendChild(inlineTarget);
    document.body.appendChild(parkingTarget);
    const surface = (target: HTMLElement) => (
      <ComposeSurface
        dockIndex={0}
        dockTarget={null}
        formId="compose-form"
        inlineTarget={target}
        open
        presentation="thread"
        sendDisabled={false}
        status="Draft saved"
        title="Reply"
        windowSlot={0}
        onOpenChange={() => undefined}
      >
        <Editor />
      </ComposeSurface>
    );

    const view = await renderComponent(surface(inlineTarget));
    const input = document.body.querySelector<HTMLInputElement>('[aria-label="Draft body"]');
    if (input) input.value = "Keep this reply";
    await view.rerender(surface(parkingTarget));
    await flushHookEffects();

    expect(mounts).toBe(1);
    expect(parkingTarget.querySelector('[aria-label="Draft body"]')).not.toBeNull();
    expect(parkingTarget.querySelector<HTMLInputElement>('[aria-label="Draft body"]')?.value).toBe(
      "Keep this reply"
    );

    await view.unmount();
  });
});

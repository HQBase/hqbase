// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { RichEmailEditor } from "@/features/compose/rich-email-editor";
import { flushHookEffects, renderComponent } from "../render-hook";

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("rich email editor images", () => {
  it("uploads an image and shows its resize box only after selection", async () => {
    const onChange = vi.fn();
    const onImages = vi.fn(async (files: File[]) => [
      {
        alt: files[0]?.name ?? "Image",
        src: "/api/v2/drafts/draft-1/attachments/attachment-1/inline"
      }
    ]);
    const view = await renderComponent(
      <RichEmailEditor html="<p>Hello</p>" onChange={onChange} onImages={onImages} />
    );
    document.body.appendChild(view.container);
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Expected image picker");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([pngHeader], "logo.png", { type: "image/png" })]
    });

    await flushHookEffects(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await vi.waitFor(() => expect(onImages).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.stringContaining('alt="logo.png"'),
        expect.stringContaining("logo.png")
      )
    );
    const editor = view.container.querySelector<HTMLElement>(".ProseMirror");
    const renderedImage = view.container.querySelector<HTMLImageElement>(".ProseMirror img");
    const resizeContainer = view.container.querySelector<HTMLElement>("[data-resize-container]");
    if (!editor || !renderedImage || !resizeContainer) throw new Error("Expected resizable image");
    expect(view.container.querySelectorAll("[data-resize-handle]")).toHaveLength(8);
    expect(resizeContainer.classList.contains("ProseMirror-selectednode")).toBe(false);
    expect(editor.className).toContain("[&_[data-resize-handle]]:hidden");
    expect(editor.className).toContain("cursor-ns-resize");
    expect(editor.className).toContain("cursor-ew-resize");
    expect(editor.className).toContain("cursor-nwse-resize");
    expect(editor.className).toContain("cursor-nesw-resize");
    expect(editor.className).toContain("@media(pointer:coarse)");

    renderedImage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(resizeContainer.classList.contains("ProseMirror-selectednode")).toBe(true)
    );
    await view.unmount();
  });

  it("splits pasted raster images from ordinary attachments", async () => {
    const onFiles = vi.fn();
    const onImages = vi.fn(async () => [
      {
        alt: "logo.png",
        src: "/api/v2/drafts/draft-1/attachments/attachment-1/inline"
      }
    ]);
    const view = await renderComponent(
      <RichEmailEditor
        html="<p>Hello</p>"
        onChange={() => undefined}
        onFiles={onFiles}
        onImages={onImages}
      />
    );
    document.body.appendChild(view.container);
    const editor = view.container.querySelector<HTMLElement>(".ProseMirror");
    if (!editor) throw new Error("Expected editor");
    const image = new File([pngHeader], "logo.png", { type: "image/png" });
    const documentFile = new File(["report"], "report.pdf", { type: "application/pdf" });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { files: [image, documentFile], getData: () => "", items: [], types: [] }
    });

    await flushHookEffects(() => editor.dispatchEvent(paste));
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledWith([documentFile]));
    await vi.waitFor(() => expect(onImages).toHaveBeenCalledWith([image], expect.any(String)));
    await view.unmount();
  });

  it("inserts a dropped raster image", async () => {
    const onImages = vi.fn(async () => [
      {
        alt: "dropped.png",
        src: "/api/v2/drafts/draft-1/attachments/attachment-2/inline"
      }
    ]);
    const view = await renderComponent(
      <RichEmailEditor html="<p>Hello</p>" onChange={() => undefined} onImages={onImages} />
    );
    document.body.appendChild(view.container);
    const editor = view.container.querySelector<HTMLElement>(".ProseMirror");
    if (!editor) throw new Error("Expected editor");
    const image = new File([pngHeader], "dropped.png", { type: "image/png" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperties(drop, {
      clientX: { value: 0 },
      clientY: { value: 0 },
      dataTransfer: {
        value: { files: [image], getData: () => "", items: [], types: [] }
      }
    });

    await flushHookEffects(() => editor.dispatchEvent(drop));
    await vi.waitFor(() => expect(onImages).toHaveBeenCalledWith([image], expect.any(String)));
    await view.unmount();
  });

  it("keeps private v1 draft images but drops remote image HTML", async () => {
    const view = await renderComponent(
      <RichEmailEditor
        html={
          '<img alt="Kept" src="/api/v1/drafts/draft-1/attachments/image-1/inline"><img alt="Dropped" src="https://tracker.example/pixel.png">'
        }
        onChange={() => undefined}
        onImages={async () => []}
      />
    );
    document.body.appendChild(view.container);

    const images = view.container.querySelectorAll<HTMLImageElement>(".ProseMirror img");
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("src")).toBe(
      "/api/v1/drafts/draft-1/attachments/image-1/inline"
    );
    await view.unmount();
  });

  it("commits touch resizing and exposes keyboard image size controls", async () => {
    const onChange = vi.fn();
    const view = await renderComponent(
      <RichEmailEditor
        html='<img alt="Logo" src="/api/v2/drafts/draft-1/attachments/image-1/inline">'
        onChange={onChange}
        onImages={async () => []}
      />
    );
    document.body.appendChild(view.container);
    const image = view.container.querySelector<HTMLImageElement>(".ProseMirror img");
    const handle = view.container.querySelector<HTMLElement>('[data-resize-handle="bottom-right"]');
    if (!image || !handle) throw new Error("Expected resizable image");
    Object.defineProperties(image, {
      offsetHeight: {
        configurable: true,
        get: () => Number.parseFloat(image.style.height) || 50
      },
      offsetWidth: {
        configurable: true,
        get: () => Number.parseFloat(image.style.width) || 100
      }
    });

    image.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(
        view.container
          .querySelector<HTMLElement>("[data-resize-container]")
          ?.classList.contains("ProseMirror-selectednode")
      ).toBe(true)
    );

    const touchStart = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, "touches", { value: [{ clientX: 0, clientY: 0 }] });
    handle.dispatchEvent(touchStart);
    const touchMove = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(touchMove, "touches", { value: [{ clientX: 40, clientY: 20 }] });
    document.dispatchEvent(touchMove);
    const touchEnd = new Event("touchend", { bubbles: true, cancelable: true });
    Object.defineProperty(touchEnd, "touches", { value: [] });
    document.dispatchEvent(touchEnd);

    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.stringMatching(/height="70"[^>]*width="140"|width="140"[^>]*height="70"/u),
        expect.stringContaining("Logo")
      )
    );

    image.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1, clientY: 1 }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    const smaller = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Make selected image smaller"]'
    );
    const larger = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Make selected image larger"]'
    );
    if (!smaller || !larger) throw new Error("Expected image size controls");
    await vi.waitFor(() => expect(smaller.disabled).toBe(false));
    expect(larger.disabled).toBe(false);
    smaller.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.stringContaining('width="112"'),
        expect.stringContaining("Logo")
      )
    );
    await view.unmount();
  });

  it("keeps concurrent image uploads in the order they were inserted", async () => {
    const pending = new Map<string, (images: Array<{ alt: string; src: string }>) => void>();
    const onChange = vi.fn();
    const onImages = vi.fn(
      (files: File[]) =>
        new Promise<Array<{ alt: string; src: string }>>((resolve) => {
          pending.set(files[0]?.name ?? "", resolve);
        })
    );
    const view = await renderComponent(
      <RichEmailEditor html="<p>Hello</p>" onChange={onChange} onImages={onImages} />
    );
    document.body.appendChild(view.container);
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Expected image picker");
    for (const name of ["first.png", "second.png"]) {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File([pngHeader], name, { type: "image/png" })]
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await vi.waitFor(() => expect(pending.size).toBe(2));

    pending.get("second.png")?.([
      {
        alt: "second.png",
        src: "/api/v2/drafts/draft-1/attachments/image-2/inline"
      }
    ]);
    await Promise.resolve();
    expect(view.container.querySelector('img[alt="second.png"]')).toBeNull();
    pending.get("first.png")?.([
      {
        alt: "first.png",
        src: "/api/v2/drafts/draft-1/attachments/image-1/inline"
      }
    ]);
    await vi.waitFor(() => {
      const value = String(onChange.mock.calls.at(-1)?.[0] ?? "");
      expect(value.indexOf('alt="first.png"')).toBeGreaterThanOrEqual(0);
      expect(value.indexOf('alt="first.png"')).toBeLessThan(value.indexOf('alt="second.png"'));
    });
    await view.unmount();
  });

  it("serializes signature image batches so each limit check sees prior images", async () => {
    let finishFirst: ((images: Array<{ alt: string; src: string }>) => void) | undefined;
    const onImages = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Array<{ alt: string; src: string }>>((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockResolvedValueOnce([{ alt: "second.png", src: "data:image/png;base64,iVBORw0KGgo=" }]);
    const view = await renderComponent(
      <RichEmailEditor
        allowDataImages
        html="<p>Regards</p>"
        onChange={() => undefined}
        onImages={onImages}
      />
    );
    document.body.appendChild(view.container);
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Expected image picker");
    for (const name of ["first.png", "second.png"]) {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File([pngHeader], name, { type: "image/png" })]
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await vi.waitFor(() => expect(onImages).toHaveBeenCalledTimes(1));
    finishFirst?.([{ alt: "first.png", src: "data:image/png;base64,iVBORw0KGgo=" }]);
    await vi.waitFor(() => expect(onImages).toHaveBeenCalledTimes(2));
    expect(onImages.mock.calls[1]?.[1]).toContain('alt="first.png"');
    await view.unmount();
  });
});

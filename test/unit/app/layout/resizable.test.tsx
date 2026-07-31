// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { renderComponent } from "../render-hook";

describe("ResizableHandle", () => {
  it("keeps a horizontal group's vertical separator on the inline axis", async () => {
    const view = await renderComponent(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel>Sidebar</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>Content</ResizablePanel>
      </ResizablePanelGroup>
    );

    const separator = view.container.querySelector<HTMLElement>("[role=separator]");

    expect(separator).not.toBeNull();
    expect(separator?.getAttribute("aria-orientation")).toBe("vertical");
    expect(separator?.className).toContain("w-px");
    expect(separator?.className).toContain("aria-[orientation=horizontal]:h-px");
    expect(separator?.className).toContain("aria-[orientation=horizontal]:w-full");
    expect(separator?.className).not.toContain("aria-[orientation=vertical]");

    await view.unmount();
  });
});

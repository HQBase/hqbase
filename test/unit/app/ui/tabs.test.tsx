// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

describe("tabs", () => {
  it("uses an evenly inset pill treatment by default", async () => {
    const view = await renderComponent(
      <Tabs defaultValue="first">
        <TabsList>
          <TabsTrigger value="first">First</TabsTrigger>
          <TabsTrigger value="second">Second</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    const list = view.container.querySelector<HTMLElement>('[role="tablist"]');
    const trigger = view.container.querySelector<HTMLElement>('[role="tab"]');

    expect(list?.classList.contains("rounded-full")).toBe(true);
    expect(list?.classList.contains("p-1")).toBe(true);
    expect(trigger?.classList.contains("h-7")).toBe(true);
    expect(trigger?.classList.contains("min-h-0")).toBe(true);
    expect(trigger?.classList.contains("rounded-full")).toBe(true);
    await view.unmount();
  });
});

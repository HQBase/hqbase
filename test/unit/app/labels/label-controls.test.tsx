// @vitest-environment happy-dom
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LabelBadges, LabelFilter } from "@/features/labels/label-controls";
import { LabelSettings } from "@/features/labels/label-settings";
import type { MailLabel } from "@/features/labels/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const label: MailLabel = {
  color: "blue",
  createdAt: "2026-08-24T12:00:00.000Z",
  id: "label-1",
  name: "Customer",
  updatedAt: "2026-08-24T12:00:00.000Z"
};
const priorityLabel: MailLabel = {
  ...label,
  color: "red",
  id: "label-2",
  name: "Priority"
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("label controls", () => {
  it("shows a label filter and compact visible assignments", () => {
    const filter = renderToStaticMarkup(
      <LabelFilter labels={[label]} values={[]} onChange={() => undefined} />
    );
    const badges = renderToStaticMarkup(<LabelBadges labels={[label]} />);

    expect(filter).toContain('aria-label="Filter by labels"');
    expect(filter).toContain(">Labels</span>");
    expect(badges).toContain("Customer");
    expect(badges).toContain("bg-blue-500/15");
  });

  it("keeps the compact filter open while selecting every required label", async () => {
    const onChange = vi.fn();
    function FilterHarness(): React.ReactElement {
      const [values, setValues] = React.useState<string[]>([]);
      return (
        <LabelFilter
          labels={[label, priorityLabel]}
          values={values}
          onChange={(next) => {
            setValues(next);
            onChange(next);
          }}
        />
      );
    }
    const view = await renderComponent(<FilterHarness />);
    const trigger = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Filter by labels"]'
    );
    await flushHookEffects(() => {
      trigger?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      trigger?.click();
    });

    const item = (name: string) =>
      [...document.body.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find((entry) =>
        entry.textContent?.includes(name)
      );
    await flushHookEffects(() => item("Customer")?.click());
    await flushHookEffects(() => item("Priority")?.click());

    expect(onChange).toHaveBeenNthCalledWith(1, ["label-1"]);
    expect(onChange).toHaveBeenNthCalledWith(2, ["label-1", "label-2"]);
    expect(view.container.textContent).toContain("2");
    await view.unmount();
  });

  it("lets managers maintain shared labels with compact actions", () => {
    const html = renderToStaticMarkup(
      <LabelSettings canManage labels={[label]} onChanged={async () => undefined} />
    );

    expect(html).toContain("Shared organization for people and mail agents");
    expect(html).toContain("Add label");
    expect(html).toContain('aria-label="Edit Customer"');
    expect(html).toContain('aria-label="Delete Customer"');
    expect(html).not.toContain("h-11");
  });
});

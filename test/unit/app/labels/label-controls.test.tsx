// @vitest-environment happy-dom
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LabelBadges, LabelMenu, LabelStack } from "@/features/labels/label-controls";
import { LabelFilter } from "@/features/labels/label-filter";
import { LabelSettings } from "@/features/labels/label-settings";
import type { MailLabel } from "@/features/labels/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const apiMocks = vi.hoisted(() => ({
  createLabel: vi.fn(),
  deleteLabel: vi.fn(),
  updateLabel: vi.fn()
}));

vi.mock("@/features/labels/api", () => apiMocks);

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
const shortLabel: MailLabel = { ...label, id: "label-short", name: "HR" };
const importantLabel: MailLabel = { ...label, id: "label-important", name: "Important" };

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("label controls", () => {
  it("shows a label filter and compact visible assignments", () => {
    const filter = renderToStaticMarkup(
      <LabelFilter labels={[label]} values={[]} onChange={() => undefined} />
    );
    const selectedFilter = renderToStaticMarkup(
      <LabelFilter
        labels={[label, priorityLabel]}
        values={[label.id, priorityLabel.id]}
        onChange={() => undefined}
      />
    );
    const badges = renderToStaticMarkup(<LabelBadges labels={[label]} />);
    const compact = renderToStaticMarkup(
      <LabelStack compact labels={[shortLabel, importantLabel]} />
    );

    expect(filter).toContain('aria-label="Filter by labels"');
    expect(filter).toContain('data-label-filter-icon="tag"');
    expect(filter).toContain("size-[11px]");
    expect(filter).toContain(">Labels</span>");
    expect(selectedFilter).toContain("Customer");
    expect(selectedFilter).toContain("Priority");
    expect(selectedFilter).toContain("h-7");
    expect(selectedFilter).toContain("text-[11px]");
    expect(selectedFilter).toContain("text-muted-foreground");
    expect(badges).toContain("Customer");
    expect(badges).toContain("bg-blue-500/15");
    expect(badges).toContain("text-blue-700");
    expect(badges).toContain("dark:text-blue-300");
    expect(badges).not.toContain("text-foreground");
    expect(compact).toContain(">HR</span>");
    expect(compact).toContain(">Important</span>");
    expect(compact).toContain("min-w-10");
    expect(compact).toContain("max-w-20");
  });

  it("names three labels and keeps overflow colors visible", () => {
    const labels = [
      label,
      priorityLabel,
      { ...label, color: "amber" as const, id: "label-3", name: "Billing" },
      { ...label, color: "green" as const, id: "label-4", name: "Follow up" },
      { ...label, color: "purple" as const, id: "label-5", name: "Partner" }
    ];
    const stack = renderToStaticMarkup(<LabelStack labels={labels} />);

    expect(stack).toContain(">Customer</span>");
    expect(stack).toContain(">Priority</span>");
    expect(stack).toContain(">Billing</span>");
    expect(stack.match(/data-label-stack-color=/gu)).toHaveLength(2);
    expect(stack).toContain('data-label-stack-color="green"');
    expect(stack).toContain('data-label-stack-color="purple"');
  });

  it("switches the menu trigger between label and more icons", () => {
    const rowMenu = renderToStaticMarkup(
      <LabelMenu
        assigned={[label]}
        labels={[label]}
        onToggle={() => undefined}
        showAssignedLabels
        showTagIcon
      />
    );
    const generalMenu = renderToStaticMarkup(
      <LabelMenu assigned={[label]} labels={[label]} onToggle={() => undefined} />
    );
    const readerMenu = renderToStaticMarkup(
      <LabelMenu
        assigned={[label]}
        compactAssignedLabels={false}
        labels={[label]}
        onToggle={() => undefined}
        showAssignedLabels
        showTagIcon
      />
    );
    const emptyReaderMenu = renderToStaticMarkup(
      <LabelMenu
        assigned={[]}
        compactAssignedLabels={false}
        emptyAssignedText="Add label"
        labels={[label]}
        onToggle={() => undefined}
        showAssignedLabels
        showTagIcon
      />
    );

    expect(rowMenu).toContain('data-label-menu-icon="tag"');
    expect(rowMenu).toContain('data-message-labels="desktop"');
    expect(rowMenu).toContain('aria-label="Labels: Customer"');
    expect(rowMenu).toContain("Customer");
    expect(rowMenu).not.toContain('data-label-menu-icon="more"');
    expect(rowMenu).not.toContain("bottom-1");
    expect(generalMenu).toContain('data-label-menu-icon="more"');
    expect(generalMenu).toContain('aria-label="Labels"');
    expect(generalMenu).not.toContain('data-label-menu-icon="tag"');
    expect(generalMenu).toContain("bottom-1");
    expect(readerMenu).toContain("max-w-24");
    expect(readerMenu).toContain("text-[10px]");
    expect(readerMenu).not.toContain("max-w-20");
    expect(emptyReaderMenu).toContain('aria-label="Add label"');
    expect(emptyReaderMenu).toContain(">Add label</span>");
    expect(emptyReaderMenu).toContain("text-[10px]");
  });

  it("opens from an assigned label and closes after a label choice", async () => {
    const view = await renderComponent(
      <LabelMenu
        assigned={[label]}
        labels={[label]}
        onToggle={() => undefined}
        showAssignedLabels
        showTagIcon
      />
    );
    const assignedLabel = [...view.container.querySelectorAll<HTMLElement>("span")].find(
      (entry) => entry.textContent === "Customer"
    );
    await flushHookEffects(() => {
      assignedLabel?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      assignedLabel?.click();
    });
    const item = document.body.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
    expect(item).not.toBeNull();
    await flushHookEffects(() => item?.click());

    expect(document.body.querySelector('[role="menuitemcheckbox"]')).toBeNull();
    await view.unmount();
  });

  it("lets an owner create a label from an empty assignment menu", async () => {
    const createdLabel = { ...label, id: "label-created", name: "Created here" };
    apiMocks.createLabel.mockResolvedValue(createdLabel);
    const onLabelsChanged = vi.fn().mockResolvedValue(undefined);
    const onToggle = vi.fn().mockResolvedValue(undefined);
    const view = await renderComponent(
      <LabelMenu
        assigned={[]}
        canCreateLabels
        labels={[]}
        onLabelsChanged={onLabelsChanged}
        onToggle={onToggle}
      />
    );
    const trigger = view.container.querySelector<HTMLButtonElement>('[aria-label="Labels"]');
    expect(trigger?.disabled).toBe(false);
    await flushHookEffects(() => {
      trigger?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      trigger?.click();
    });

    const create = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Create label")
    );
    expect(create).not.toBeNull();
    await flushHookEffects(() => create?.click());
    expect(document.body.textContent).toContain("Choose a shared name and color.");
    const name = document.body.querySelector<HTMLInputElement>("#label-name");
    expect(name).not.toBeNull();
    if (name) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        name,
        "Created here"
      );
      name.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await flushHookEffects(() => document.body.querySelector("form")?.requestSubmit());
    expect(apiMocks.createLabel).toHaveBeenCalledWith({ color: "blue", name: "Created here" });
    expect(onToggle).toHaveBeenCalledWith(createdLabel, true);
    expect(onLabelsChanged).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it("updates assignments optimistically without fading the trigger", async () => {
    let rejectToggle: (reason: Error) => void = () => undefined;
    const pendingToggle = new Promise<void>((_resolve, reject) => {
      rejectToggle = reject;
    });
    const view = await renderComponent(
      <LabelMenu
        assigned={[label]}
        labels={[label]}
        onToggle={() => pendingToggle}
        showAssignedLabels
        showTagIcon
      />
    );
    const trigger = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Labels: Customer"]'
    );
    await flushHookEffects(() => {
      trigger?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      trigger?.click();
    });
    const item = document.body.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
    await flushHookEffects(() => item?.click());

    expect(trigger?.getAttribute("aria-label")).toBe("Labels");
    expect(trigger?.textContent).not.toContain("Customer");
    expect(trigger?.disabled).toBe(false);
    expect(trigger?.getAttribute("aria-busy")).toBe("true");

    await flushHookEffects(() => rejectToggle(new Error("Label update failed.")));

    expect(trigger?.getAttribute("aria-label")).toBe("Labels: Customer");
    expect(trigger?.textContent).toContain("Customer");
    expect(trigger?.disabled).toBe(false);
    await view.unmount();
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
    expect(trigger?.textContent).toContain("Customer");
    expect(trigger?.textContent).toContain("Priority");
    await view.unmount();
  });

  it("lets managers maintain shared labels with compact actions", () => {
    const html = renderToStaticMarkup(
      <LabelSettings canManage labels={[label]} onChanged={async () => undefined} />
    );

    expect(html).toContain("Shared organization for people and mail agents");
    expect(html).toContain("Add label");
    expect(html).toContain('aria-label="Actions for Customer"');
    expect(html).not.toContain('aria-label="Edit Customer"');
    expect(html).not.toContain('aria-label="Delete Customer"');
    expect(html).toContain('data-slot="table"');
    expect(html).toContain("rounded-lg border");
    expect(html).toContain(">Label</th>");
    expect(html).toContain(">Color</th>");
    expect(html).toContain(">Actions</th>");
    expect(html).not.toContain("h-11");
  });
});

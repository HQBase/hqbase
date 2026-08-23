// @vitest-environment happy-dom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { flushHookEffects, renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

async function openDialog() {
  const view = await renderComponent(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>Test dialog</DialogTitle>
        <DialogClose aria-label="Close test dialog">Close</DialogClose>
      </DialogContent>
    </Dialog>
  );
  await flushHookEffects(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return view;
}

function DialogWithOpenSelect(): React.ReactElement {
  const [selectOpen, setSelectOpen] = React.useState(true);
  return (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>Dialog with dropdown</DialogTitle>
        <Select open={selectOpen} value="first" onOpenChange={setSelectOpen}>
          <SelectTrigger aria-label="Test dropdown">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="first">First</SelectItem>
            <SelectItem value="second">Second</SelectItem>
          </SelectContent>
        </Select>
        <button data-dialog-control type="button">
          Another dialog control
        </button>
        <output data-select-state>{selectOpen ? "open" : "closed"}</output>
      </DialogContent>
    </Dialog>
  );
}

describe("dialog interactions", () => {
  it("ignores a backdrop pointer down", async () => {
    const view = await openDialog();
    const overlay = document.body.querySelector<HTMLElement>(
      '[data-state="open"]:not([role="dialog"])'
    );

    expect(overlay).not.toBeNull();
    await flushHookEffects(() =>
      overlay?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          composed: true,
          pointerType: "mouse"
        })
      )
    );

    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("data-state")).toBe("open");
    await view.unmount();
  });

  it("closes a nested dropdown without closing its dialog", async () => {
    const view = await renderComponent(<DialogWithOpenSelect />);
    await flushHookEffects(() => new Promise((resolve) => setTimeout(resolve, 0)));
    const dialogControl = document.body.querySelector<HTMLElement>("[data-dialog-control]");

    expect(document.body.querySelector("[data-select-state]")?.textContent).toBe("open");
    expect(dialogControl).not.toBeNull();
    await flushHookEffects(() =>
      dialogControl?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          composed: true,
          pointerType: "mouse"
        })
      )
    );

    expect(document.body.querySelector("[data-select-state]")?.textContent).toBe("closed");
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("data-state")).toBe("open");
    await view.unmount();
  });

  it("still closes through Escape and an explicit close control", async () => {
    const escapeView = await openDialog();
    await flushHookEffects(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))
    );
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await escapeView.unmount();

    const closeView = await openDialog();
    await flushHookEffects(() =>
      document.body.querySelector<HTMLButtonElement>('[aria-label="Close test dialog"]')?.click()
    );
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await closeView.unmount();
  });
});

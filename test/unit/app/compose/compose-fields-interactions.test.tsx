// @vitest-environment happy-dom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ComposeFields } from "@/features/compose/compose-fields";
import { flushHookEffects, renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

describe("compose field disclosure", () => {
  it("reveals Cc and Bcc from the To row", async () => {
    const view = await renderComponent(<ComposeFieldsHarness />);
    document.body.appendChild(view.container);

    expect(view.container.querySelector('[aria-label="Cc"]')).toBeNull();
    expect(view.container.querySelector('[aria-label="Bcc"]')).toBeNull();

    const disclosure = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Show Cc and Bcc"]'
    );
    await flushHookEffects(() => disclosure?.click());

    expect(view.container.querySelector('[aria-label="Cc"]')).not.toBeNull();
    expect(view.container.querySelector('[aria-label="Bcc"]')).not.toBeNull();
    expect(view.container.querySelector('[aria-label="Show Cc and Bcc"]')).toBeNull();

    const cc = view.container.querySelector<HTMLInputElement>('[aria-label="Cc"]');
    await setInput(cc, "team@example.net");
    expect(view.container.querySelector('[aria-label="Hide Cc and Bcc"]')).toBeNull();
    await setInput(cc, "");

    const collapse = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Hide Cc and Bcc"]'
    );
    await flushHookEffects(() => collapse?.click());

    expect(view.container.querySelector('[aria-label="Cc"]')).toBeNull();
    expect(view.container.querySelector('[aria-label="Bcc"]')).toBeNull();
    expect(view.container.querySelector('[aria-label="Show Cc and Bcc"]')).not.toBeNull();
    await view.unmount();
  });
});

function ComposeFieldsHarness(): React.ReactElement {
  const [cc, setCc] = React.useState("");
  const [bcc, setBcc] = React.useState("");
  return (
    <ComposeFields
      bcc={bcc}
      cc={cc}
      from="support@example.com"
      fromDisabled={false}
      identities={[{ mailboxId: "mbx_1", address: "support@example.com", displayName: "Support" }]}
      mode="new"
      subject=""
      to=""
      setBcc={setBcc}
      setCc={setCc}
      setFrom={() => undefined}
      setSubject={() => undefined}
      setTo={() => undefined}
    />
  );
}

async function setInput(input: HTMLInputElement | null, value: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await flushHookEffects(() => {
    setValue?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { ComposeFields } from "@/features/compose/compose-fields";
import { flushHookEffects, renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

describe("compose field disclosure", () => {
  it("reveals Cc and Bcc from the To row", async () => {
    const view = await renderComponent(
      <ComposeFields
        bcc=""
        cc=""
        from="support@example.com"
        fromDisabled={false}
        identities={[
          { mailboxId: "mbx_1", address: "support@example.com", displayName: "Support" }
        ]}
        mode="new"
        subject=""
        to=""
        setBcc={() => undefined}
        setCc={() => undefined}
        setFrom={() => undefined}
        setSubject={() => undefined}
        setTo={() => undefined}
      />
    );
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
    await view.unmount();
  });
});

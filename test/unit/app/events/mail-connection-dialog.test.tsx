// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { MailConnectionDialog } from "@/features/events/mail-connection-dialog";
import type { MailConnectionStatus } from "@/features/events/types";
import { flushHookEffects, renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

describe("mail connection dialog", () => {
  it("stays silent during normal reconnects and opens only when every sync path is unavailable", async () => {
    const dialog = (status: MailConnectionStatus) => <MailConnectionDialog status={status} />;
    const view = await renderComponent(dialog("connecting"));
    document.body.appendChild(view.container);

    expect(document.body.textContent).not.toContain("Connection lost");
    await view.rerender(dialog("fallback"));
    expect(document.body.textContent).not.toContain("Connection lost");

    await view.rerender(dialog("unavailable"));
    expect(document.body.textContent).toContain("Connection lost");
    expect(document.body.textContent).toContain("reconnect and refresh your mail automatically");

    await view.rerender(dialog("connected"));
    expect(document.body.textContent).not.toContain("Connection lost");
    await view.unmount();
  });

  it("stays dismissed for one outage and opens again after recovery", async () => {
    const dialog = (status: MailConnectionStatus) => <MailConnectionDialog status={status} />;
    const view = await renderComponent(dialog("unavailable"));
    document.body.appendChild(view.container);

    await flushHookEffects(() =>
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "Dismiss")
        ?.click()
    );
    expect(document.body.textContent).not.toContain("Connection lost");

    await view.rerender(dialog("unavailable"));
    expect(document.body.textContent).not.toContain("Connection lost");
    await view.rerender(dialog("connected"));
    await view.rerender(dialog("unavailable"));
    expect(document.body.textContent).toContain("Connection lost");
    await view.unmount();
  });
});

// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import {
  CloudflareAuthorizationDialogBody,
  CloudflareAuthorizationFlow
} from "@/features/settings/cloudflare-authorization-dialog";
import { flushHookEffects, renderComponent } from "../render-hook";

const mocks = vi.hoisted(() => ({
  getRecentAuthentication: vi.fn(),
  reauthenticate: vi.fn()
}));

vi.mock("@/features/auth/recent-authentication-api", () => ({
  getRecentAuthentication: mocks.getRecentAuthentication,
  reauthenticate: mocks.reauthenticate
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => vi.restoreAllMocks());

describe("Cloudflare authorization dialog", () => {
  it("explains the handoff and keeps authorization inside the modal", () => {
    const html = renderToStaticMarkup(
      <Dialog>
        <CloudflareAuthorizationDialogBody
          authorizeHref="/api/domains/cloudflare/oauth/start"
          description="To save this change, HQBase needs temporary access to your Cloudflare account."
        />
      </Dialog>
    );

    expect(html).toContain("Authorize Cloudflare");
    expect(html).toContain("To save this change");
    expect(html).toContain("Cancel");
    expect(html).toContain('href="/api/domains/cloudflare/oauth/start"');
  });

  it("continues Cloudflare authorization in the successful stale-session transition", async () => {
    const authorizeHref = "/api/domains/cloudflare/oauth/start";
    const onAuthorize = vi.fn();
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
    mocks.getRecentAuthentication.mockResolvedValue(false);
    mocks.reauthenticate.mockResolvedValue(undefined);
    const view = await renderComponent(
      <CloudflareAuthorizationFlow
        active
        authorizeHref={authorizeHref}
        description="To save this change, HQBase needs temporary access to your Cloudflare account."
        layout="inline"
        onAuthorize={onAuthorize}
      />
    );
    await flushHookEffects();

    const input = view.container.querySelector<HTMLInputElement>('input[type="password"]');
    const form = view.container.querySelector("form");
    if (!input || !form) throw new Error("The Cloudflare reauthentication form is missing.");
    await flushHookEffects(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setter) throw new Error("The input value setter is unavailable.");
      setter.call(input, "correct-password");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushHookEffects(() => form.dispatchEvent(new Event("submit", { bubbles: true })));

    expect(mocks.reauthenticate).toHaveBeenCalledWith("correct-password");
    expect(onAuthorize).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(authorizeHref);
    const onAuthorizeOrder = onAuthorize.mock.invocationCallOrder[0];
    const assignOrder = assign.mock.invocationCallOrder[0];
    if (onAuthorizeOrder === undefined || assignOrder === undefined) {
      throw new Error("The Cloudflare authorization transition did not complete.");
    }
    expect(onAuthorizeOrder).toBeLessThan(assignOrder);
    await view.unmount();
  });
});

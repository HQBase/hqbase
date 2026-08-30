// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { listUsableSignatures } from "@/features/signatures/api";
import { ComposeSignature } from "@/features/signatures/compose-signature";
import type { Signature, SignatureSnapshot } from "@/features/signatures/types";
import { flushHookEffects, renderComponent } from "../render-hook";

vi.mock("@/features/signatures/api", () => ({ listUsableSignatures: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const candidate: Signature = {
  id: "sig_support",
  name: "Support",
  html: "<p>HQBase Support</p>",
  text: "HQBase Support",
  scope: "mailbox",
  scopeId: "mbx_support",
  scopeLabel: "Support · support@example.com",
  isDefault: true,
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z"
};
const automatic: SignatureSnapshot = {
  mode: "automatic",
  id: candidate.id,
  name: candidate.name,
  html: candidate.html,
  text: candidate.text
};

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("compose signature", () => {
  it("shows a captured default by name without an Automatic option", async () => {
    vi.mocked(listUsableSignatures).mockResolvedValue({
      automaticSignatureId: candidate.id,
      signatures: [candidate]
    });
    const onManage = vi.fn();
    const onSelectionChange = vi.fn().mockResolvedValue(undefined);
    const view = await renderComponent(
      <ComposeSignature
        from="support@example.com"
        signature={automatic}
        onManage={onManage}
        onSelectionChange={onSelectionChange}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    expect(listUsableSignatures).toHaveBeenCalledWith("support@example.com");
    const preview = view.container.querySelector<HTMLIFrameElement>(
      'iframe[title="Signature preview"]'
    );
    expect(preview?.srcdoc).toContain("HQBase Support");
    const trigger = view.container.querySelector<HTMLButtonElement>('[aria-label="Signature"]');
    expect(trigger?.textContent).toContain("Support · Support");
    expect(trigger?.className).toContain("h-[42px]");
    expect(trigger?.className).toContain("sm:h-[34px]");

    await openSignatureMenu(view.container);
    const options = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    );
    expect(options.some((item) => item.textContent?.includes("Automatic"))).toBe(false);
    const none = options.find((item) => item.textContent?.includes("No signature"));
    await flushHookEffects(() => none?.click());
    expect(onSelectionChange).toHaveBeenCalledWith({ mode: "none" });

    await openSignatureMenu(view.container);
    const manage = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    ).find((item) => item.textContent?.includes("Manage signatures"));
    await flushHookEffects(() => manage?.click());
    expect(onManage).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it("re-resolves an empty automatic selection when a default is available", async () => {
    vi.mocked(listUsableSignatures).mockResolvedValue({
      automaticSignatureId: candidate.id,
      signatures: [candidate]
    });
    const onSelectionChange = vi.fn().mockResolvedValue(undefined);
    const view = await renderComponent(
      <ComposeSignature
        from="support@example.com"
        signature={{ mode: "automatic", id: null, name: "", html: "", text: "" }}
        onManage={() => undefined}
        onSelectionChange={onSelectionChange}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    await vi.waitFor(() => expect(onSelectionChange).toHaveBeenCalledWith({ mode: "automatic" }));
    await view.rerender(
      <ComposeSignature
        from="support@example.com"
        signature={automatic}
        onManage={() => undefined}
        onSelectionChange={onSelectionChange}
      />
    );
    expect(
      view.container.querySelector<HTMLButtonElement>('[aria-label="Signature"]')?.textContent
    ).toContain("Support · Support");
    await view.unmount();
  });

  it("keeps No signature when no default is available", async () => {
    vi.mocked(listUsableSignatures).mockResolvedValue({
      automaticSignatureId: null,
      signatures: [candidate]
    });
    const onSelectionChange = vi.fn().mockResolvedValue(undefined);
    const view = await renderComponent(
      <ComposeSignature
        from="support@example.com"
        signature={{ mode: "automatic", id: null, name: "", html: "", text: "" }}
        onManage={() => undefined}
        onSelectionChange={onSelectionChange}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(
      view.container.querySelector<HTMLButtonElement>('[aria-label="Signature"]')?.textContent
    ).toContain("No signature");
    await view.unmount();
  });

  it("does not replace an explicit No signature choice", async () => {
    vi.mocked(listUsableSignatures).mockResolvedValue({
      automaticSignatureId: candidate.id,
      signatures: [candidate]
    });
    const onSelectionChange = vi.fn().mockResolvedValue(undefined);
    const view = await renderComponent(
      <ComposeSignature
        from="support@example.com"
        signature={{ mode: "none", id: null, name: "", html: "", text: "" }}
        onManage={() => undefined}
        onSelectionChange={onSelectionChange}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(
      view.container.querySelector<HTMLButtonElement>('[aria-label="Signature"]')?.textContent
    ).toContain("No signature");
    await view.unmount();
  });

  it("keeps an unavailable automatic snapshot visible", async () => {
    vi.mocked(listUsableSignatures).mockResolvedValue({
      automaticSignatureId: null,
      signatures: []
    });
    const view = await renderComponent(
      <ComposeSignature
        from="support@example.com"
        signature={{ ...automatic, id: "sig_deleted", name: "Old footer" }}
        onManage={() => undefined}
        onSelectionChange={() => undefined}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();
    await openSignatureMenu(view.container);

    expect(document.body.textContent).toContain("Old footer · Saved copy");
    await view.unmount();
  });
});

async function openSignatureMenu(container: HTMLElement): Promise<void> {
  await flushHookEffects(() =>
    container.querySelector<HTMLButtonElement>('[aria-label="Signature"]')?.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        ctrlKey: false,
        pointerType: "mouse"
      })
    )
  );
}

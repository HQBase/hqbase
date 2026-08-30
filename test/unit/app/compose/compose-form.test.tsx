// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComposeForm } from "@/features/compose/compose-form";
import { listUsableSignatures } from "@/features/signatures/api";
import { flushHookEffects, renderComponent } from "../render-hook";

vi.mock("@/features/signatures/api", () => ({ listUsableSignatures: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("compose form", () => {
  it("keeps the signature inside the message scroll area but outside the editor", async () => {
    vi.mocked(listUsableSignatures).mockResolvedValue({
      automaticSignatureId: "signature-1",
      signatures: []
    });
    const view = await renderComponent(
      <ComposeForm
        attachments={[]}
        bcc=""
        cc=""
        contextLabel={null}
        formId="compose-form"
        from="support@example.com"
        fromDisabled={false}
        html="<p>Hello</p>"
        identities={[
          { address: "support@example.com", displayName: "Support", mailboxId: "mailbox-1" }
        ]}
        isPending={false}
        mode="new"
        presentation="window"
        ready
        replyMessage={null}
        replyMessages={[]}
        sendDisabled={false}
        signature={{
          mode: "selected",
          id: "signature-1",
          name: "Support",
          html: "<p>HQBase Support</p>",
          text: "HQBase Support"
        }}
        signatureDisabled={false}
        subject=""
        to="reader@example.net"
        onDiscard={() => undefined}
        onEditorChange={() => undefined}
        onFiles={() => undefined}
        onImages={async () => []}
        onManageSignatures={() => undefined}
        onRemoveAttachment={() => undefined}
        onSetBcc={() => undefined}
        onSetCc={() => undefined}
        onSetFrom={() => undefined}
        onSetSignature={() => undefined}
        onSetSubject={() => undefined}
        onSetTo={() => undefined}
        onSubmit={() => undefined}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    const scrollArea = view.container.querySelector<HTMLElement>("[data-compose-scroll-area]");
    const editor = view.container.querySelector<HTMLElement>(".ProseMirror");
    const signature = view.container.querySelector<HTMLIFrameElement>(
      'iframe[title="Signature preview"]'
    );

    expect(scrollArea?.className).toContain("overflow-auto");
    expect(scrollArea?.className).toContain("flex-col");
    expect(scrollArea?.contains(editor ?? null)).toBe(true);
    expect(scrollArea?.contains(signature ?? null)).toBe(true);
    expect(editor?.contains(signature ?? null)).toBe(false);
    expect(editor?.getAttribute("contenteditable")).toBe("true");
    expect(editor?.parentElement?.className).toContain("flex-1");
    expect(editor?.parentElement?.className).toContain("[&_.ProseMirror]:!min-h-full");
    expect(signature?.getAttribute("contenteditable")).toBeNull();
    await view.unmount();
  });
});

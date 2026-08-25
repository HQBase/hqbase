// @vitest-environment happy-dom
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Draft } from "@/features/drafts/types";
import type { SignatureSelection } from "@/features/signatures/types";
import { flushHookEffects, renderComponent } from "../render-hook";

type CapturedComposeProps = {
  isPending: boolean;
  sendDisabled: boolean;
  signatureDisabled: boolean;
  onSetSignature: (selection: SignatureSelection) => Promise<void>;
  onSetFrom: (from: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const mocks = vi.hoisted(() => ({
  captured: null as CapturedComposeProps | null,
  initializeAutosave: vi.fn(),
  listDrafts: vi.fn(),
  resetAutosave: vi.fn(),
  saveFrom: vi.fn(),
  saveSignature: vi.fn(),
  sendMessage: vi.fn()
}));

vi.mock("@/features/drafts/api", () => ({
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  deleteDraftAttachment: vi.fn(),
  listDrafts: mocks.listDrafts,
  uploadDraftAttachment: vi.fn()
}));
vi.mock("@/features/compose/api", () => ({
  replyToMessage: vi.fn(),
  sendMessage: mocks.sendMessage
}));
vi.mock("@/features/compose/compose-form", () => ({
  ComposeForm: (props: CapturedComposeProps) => {
    mocks.captured = props;
    return <div data-compose-form />;
  }
}));
vi.mock("@/features/compose/compose-surface", () => ({
  ComposeSurface: ({ children }: { children: unknown }) => children
}));
vi.mock("@/features/compose/use-draft-autosave", () => ({
  useDraftAutosave: () => ({
    initializeAutosave: mocks.initializeAutosave,
    resetAutosave: mocks.resetAutosave,
    saveFrom: mocks.saveFrom,
    saveSignature: mocks.saveSignature
  })
}));
vi.mock("@/lib/notification-sounds", () => ({ playNotificationSound: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ComposeDialog } from "@/features/compose/compose-dialog";

const draft: Draft = {
  id: "draft-signature-race",
  mailboxId: "mailbox-1",
  replyToMessageId: null,
  forwardOfMessageId: null,
  from: "support@example.com",
  to: ["reader@example.net"],
  cc: [],
  bcc: [],
  subject: "Signature race",
  text: "Ready to send",
  html: "<p>Ready to send</p>",
  signature: { mode: "automatic", id: null, name: "", html: "", text: "" },
  version: 1,
  updatedAt: "2026-08-24T12:00:00.000Z",
  attachments: []
};

describe("compose signature send ordering", () => {
  beforeEach(() => {
    mocks.captured = null;
    mocks.initializeAutosave.mockReset();
    mocks.listDrafts.mockReset().mockResolvedValue([draft]);
    mocks.resetAutosave.mockReset();
    mocks.saveFrom.mockReset().mockResolvedValue(draft);
    mocks.saveSignature.mockReset();
    mocks.sendMessage.mockReset().mockResolvedValue({ id: "sent-1" });
  });

  it("blocks send until the selected signature snapshot is saved", async () => {
    let finishSave: ((value: Draft) => void) | undefined;
    mocks.saveSignature.mockReturnValue(
      new Promise<Draft>((resolve) => {
        finishSave = resolve;
      })
    );
    const view = await renderComponent(
      <ComposeDialog
        mailboxes={[
          {
            id: "mailbox-1",
            address: "support@example.com",
            mailDomainId: "domain-1",
            displayName: "Support",
            kind: "human",
            isActive: true,
            deletedAt: null,
            accessLevel: "agent",
            createdAt: draft.updatedAt,
            updatedAt: draft.updatedAt
          }
        ]}
        open
        onOpenChange={() => undefined}
        onSent={() => undefined}
      />
    );
    await flushHookEffects();
    await flushHookEffects();
    expect(mocks.captured?.sendDisabled).toBe(false);

    let signatureSave: Promise<void> | undefined;
    await flushHookEffects(() => {
      signatureSave = mocks.captured?.onSetSignature({ mode: "none" });
    });
    expect(mocks.captured).toMatchObject({ sendDisabled: true, signatureDisabled: true });

    await flushHookEffects(() =>
      mocks.captured?.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>)
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    await flushHookEffects(() =>
      finishSave?.({ ...draft, signature: { ...draft.signature, mode: "none" } })
    );
    await signatureSave;
    expect(mocks.captured?.sendDisabled).toBe(false);
    await view.unmount();
  });

  it("blocks send until a From change resolves its new signature snapshot", async () => {
    let finishSave: ((value: Draft) => void) | undefined;
    mocks.saveFrom.mockReturnValue(
      new Promise<Draft>((resolve) => {
        finishSave = resolve;
      })
    );
    const view = await renderComponent(
      <ComposeDialog
        mailboxes={[
          {
            id: "mailbox-1",
            address: "support@example.com",
            mailDomainId: "domain-1",
            displayName: "Support",
            kind: "human",
            isActive: true,
            deletedAt: null,
            accessLevel: "agent",
            createdAt: draft.updatedAt,
            updatedAt: draft.updatedAt
          },
          {
            id: "mailbox-2",
            address: "sales@example.net",
            mailDomainId: "domain-2",
            displayName: "Sales",
            kind: "human",
            isActive: true,
            deletedAt: null,
            accessLevel: "agent",
            createdAt: draft.updatedAt,
            updatedAt: draft.updatedAt
          }
        ]}
        open
        onOpenChange={() => undefined}
        onSent={() => undefined}
      />
    );
    await flushHookEffects();
    await flushHookEffects();

    await flushHookEffects(() => mocks.captured?.onSetFrom("sales@example.net"));
    expect(mocks.saveFrom).toHaveBeenCalledWith("sales@example.net");
    expect(mocks.captured).toMatchObject({ sendDisabled: true, signatureDisabled: true });
    await flushHookEffects(() =>
      mocks.captured?.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>)
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    await flushHookEffects(() => finishSave?.({ ...draft, from: "sales@example.net" }));
    expect(mocks.captured?.sendDisabled).toBe(false);
    await view.unmount();
  });
});

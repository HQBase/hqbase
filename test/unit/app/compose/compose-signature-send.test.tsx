// @vitest-environment happy-dom
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Draft } from "@/features/drafts/types";
import type { SignatureSelection } from "@/features/signatures/types";
import { flushHookEffects, renderComponent } from "../render-hook";

type CapturedComposeProps = {
  html: string;
  isPending: boolean;
  sendDisabled: boolean;
  signatureDisabled: boolean;
  onEditorChange: (html: string, text: string) => void;
  onImages: (files: File[], currentHtml: string) => Promise<Array<{ alt: string; src: string }>>;
  onSetSignature: (selection: SignatureSelection) => Promise<void>;
  onSetFrom: (from: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const mocks = vi.hoisted(() => ({
  captured: null as CapturedComposeProps | null,
  createDraft: vi.fn(),
  deleteDraftAttachment: vi.fn(),
  initializeAutosave: vi.fn(),
  listDrafts: vi.fn(),
  resetAutosave: vi.fn(),
  saveFrom: vi.fn(),
  saveSignature: vi.fn(),
  sendMessage: vi.fn(),
  uploadDraftAttachment: vi.fn()
}));

vi.mock("@/features/drafts/api", () => ({
  createDraft: mocks.createDraft,
  deleteDraft: vi.fn(),
  deleteDraftAttachment: mocks.deleteDraftAttachment,
  listDrafts: mocks.listDrafts,
  uploadDraftAttachment: mocks.uploadDraftAttachment
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
  attachments: [],
  labels: []
};
const mailbox = {
  id: "mailbox-1",
  address: "support@example.com",
  mailDomainId: "domain-1",
  displayName: "Support",
  kind: "human" as const,
  isActive: true,
  deletedAt: null,
  accessLevel: "agent" as const,
  createdAt: draft.updatedAt,
  updatedAt: draft.updatedAt
};

describe("compose signature send ordering", () => {
  beforeEach(() => {
    mocks.captured = null;
    mocks.createDraft.mockReset().mockResolvedValue(draft);
    mocks.initializeAutosave.mockReset();
    mocks.listDrafts.mockReset().mockResolvedValue([draft]);
    mocks.resetAutosave.mockReset();
    mocks.deleteDraftAttachment.mockReset().mockResolvedValue(undefined);
    mocks.saveFrom.mockReset().mockResolvedValue(draft);
    mocks.saveSignature.mockReset();
    mocks.sendMessage.mockReset().mockResolvedValue({ id: "sent-1" });
    mocks.uploadDraftAttachment.mockReset().mockResolvedValue({
      id: "attachment-1",
      filename: "logo.png",
      contentType: "image/png",
      sizeBytes: 8,
      inline: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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
        draftId={draft.id}
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

  it("opens a text-only draft without creating autosave drift", async () => {
    const textOnlyDraft = {
      ...draft,
      text: "First <line> & next\nSecond",
      html: "<p></p>"
    };
    mocks.listDrafts.mockResolvedValue([textOnlyDraft]);
    const view = await renderComponent(
      <ComposeDialog
        draftId={draft.id}
        mailboxes={[mailbox]}
        open
        onOpenChange={() => undefined}
        onSent={() => undefined}
      />
    );
    await flushHookEffects();
    await flushHookEffects();

    const html = "<p>First &lt;line&gt; &amp; next<br>Second</p>";
    expect(mocks.captured?.html).toBe(html);
    expect(mocks.initializeAutosave).toHaveBeenCalledWith({ ...textOnlyDraft, html });
    await view.unmount();
  });

  it("keeps one new draft and unsaved input through a mailbox refresh", async () => {
    const newDraft = {
      ...draft,
      id: "draft-new-message",
      subject: "",
      text: "",
      html: "<p></p>"
    };
    mocks.listDrafts.mockResolvedValue([]);
    mocks.createDraft.mockResolvedValue(newDraft);
    const props = {
      draftId: null,
      mailboxes: [mailbox],
      open: true,
      onOpenChange: () => undefined,
      onSent: () => undefined
    };
    const view = await renderComponent(<ComposeDialog {...props} />);
    await flushHookEffects();
    await flushHookEffects();

    await flushHookEffects(() =>
      mocks.captured?.onEditorChange("<p>Unsaved words</p>", "Unsaved words")
    );
    await view.rerender(
      <ComposeDialog
        {...props}
        mailboxes={[{ ...mailbox, displayName: "Support team", updatedAt: "2026-08-31" }]}
      />
    );
    await flushHookEffects();

    expect(mocks.listDrafts).toHaveBeenCalledOnce();
    expect(mocks.createDraft).toHaveBeenCalledOnce();
    expect(mocks.captured?.html).toBe("<p>Unsaved words</p>");
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
        draftId={draft.id}
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

  it("uploads editor images as private inline draft attachments", async () => {
    const view = await renderComponent(
      <ComposeDialog
        draftId={draft.id}
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
    const file = new File(["image"], "logo.png", { type: "image/png" });

    const images = await mocks.captured?.onImages([file], "<p>Hello</p>");

    expect(mocks.uploadDraftAttachment).toHaveBeenCalledWith(draft.id, file, true);
    expect(images).toEqual([
      {
        alt: "logo.png",
        src: `/api/v2/drafts/${draft.id}/attachments/attachment-1/inline`
      }
    ]);
    await view.unmount();
  });

  it("keeps send disabled until every concurrent image upload finishes", async () => {
    const finish: Array<(attachment: Draft["attachments"][number]) => void> = [];
    mocks.uploadDraftAttachment.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish.push(resolve);
        })
    );
    const view = await renderComponent(
      <ComposeDialog
        draftId={draft.id}
        mailboxes={[mailbox]}
        open
        onOpenChange={() => undefined}
        onSent={() => undefined}
      />
    );
    await flushHookEffects();
    await flushHookEffects();
    const firstUpload = mocks.captured?.onImages(
      [new File(["first"], "first.png", { type: "image/png" })],
      draft.html
    );
    const secondUpload = mocks.captured?.onImages(
      [new File(["second"], "second.png", { type: "image/png" })],
      draft.html
    );
    await flushHookEffects();
    expect(mocks.captured?.sendDisabled).toBe(true);

    await flushHookEffects(() =>
      finish[0]?.({
        id: "image-1",
        filename: "first.png",
        contentType: "image/png",
        sizeBytes: 5,
        inline: true
      })
    );
    await firstUpload;
    expect(mocks.captured?.sendDisabled).toBe(true);

    await flushHookEffects(() =>
      finish[1]?.({
        id: "image-2",
        filename: "second.png",
        contentType: "image/png",
        sizeBytes: 6,
        inline: true
      })
    );
    await secondUpload;
    expect(mocks.captured?.sendDisabled).toBe(false);
    await view.unmount();
  });

  it("deletes an upload that completes after the composer closes", async () => {
    let finishUpload: ((attachment: Draft["attachments"][number]) => void) | undefined;
    mocks.uploadDraftAttachment.mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve;
      })
    );
    const props = {
      draftId: draft.id,
      mailboxes: [mailbox],
      onOpenChange: () => undefined,
      onSent: () => undefined
    };
    const view = await renderComponent(<ComposeDialog {...props} open />);
    await flushHookEffects();
    await flushHookEffects();
    const uploadImage = mocks.captured?.onImages(
      [new File(["image"], "logo.png", { type: "image/png" })],
      draft.html
    );
    await view.rerender(<ComposeDialog {...props} open={false} />);
    await flushHookEffects(() =>
      finishUpload?.({
        id: "stale-image",
        filename: "logo.png",
        contentType: "image/png",
        sizeBytes: 5,
        inline: true
      })
    );
    await uploadImage;

    expect(mocks.deleteDraftAttachment).toHaveBeenCalledWith(draft.id, "stale-image");
    await view.unmount();
  });

  it("cancels inline cleanup on undo, then deletes after a sustained removal", async () => {
    const imageHtml = `<p>Ready to send</p><img src="/api/v2/drafts/${draft.id}/attachments/image-1/inline" alt="Logo">`;
    mocks.listDrafts.mockResolvedValue([
      {
        ...draft,
        html: imageHtml,
        attachments: [
          {
            id: "image-1",
            filename: "logo.png",
            contentType: "image/png",
            sizeBytes: 8,
            inline: true
          }
        ]
      }
    ]);
    const view = await renderComponent(
      <ComposeDialog
        draftId={draft.id}
        mailboxes={[mailbox]}
        open
        onOpenChange={() => undefined}
        onSent={() => undefined}
      />
    );
    await flushHookEffects();
    await flushHookEffects();
    vi.useFakeTimers();

    await flushHookEffects(() => mocks.captured?.onEditorChange("<p>Ready to send</p>", "Ready"));
    await flushHookEffects(() => mocks.captured?.onEditorChange(imageHtml, "Ready Logo"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.deleteDraftAttachment).not.toHaveBeenCalled();

    await flushHookEffects(() => mocks.captured?.onEditorChange("<p>Ready to send</p>", "Ready"));
    await vi.advanceTimersByTimeAsync(1_000);
    await flushHookEffects();
    expect(mocks.deleteDraftAttachment).toHaveBeenCalledWith(draft.id, "image-1");
    await view.unmount();
  });

  it("sends normal attachments and only inline images still present in HTML", async () => {
    mocks.listDrafts.mockResolvedValue([
      {
        ...draft,
        html: `<p>Ready to send</p><img src="/api/v2/drafts/${draft.id}/attachments/image-kept/inline">`,
        attachments: [
          {
            id: "file-1",
            filename: "report.pdf",
            contentType: "application/pdf",
            sizeBytes: 10,
            inline: false
          },
          {
            id: "image-kept",
            filename: "kept.png",
            contentType: "image/png",
            sizeBytes: 8,
            inline: true
          },
          {
            id: "image-dead",
            filename: "dead.png",
            contentType: "image/png",
            sizeBytes: 8,
            inline: true
          }
        ]
      }
    ]);
    const view = await renderComponent(
      <ComposeDialog
        draftId={draft.id}
        mailboxes={[mailbox]}
        open
        onOpenChange={() => undefined}
        onSent={() => undefined}
      />
    );
    await flushHookEffects();
    await flushHookEffects();
    await flushHookEffects(() =>
      mocks.captured?.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>)
    );

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentIds: ["file-1", "image-kept"] })
    );
    await view.unmount();
  });
});

import * as React from "react";
import { toast } from "sonner";

import {
  createDraft,
  deleteDraft,
  deleteDraftAttachment,
  listDrafts,
  uploadDraftAttachment
} from "@/features/drafts/api";
import type { Draft, DraftAttachment } from "@/features/drafts/types";
import type { SignatureSnapshot } from "@/features/signatures/types";
import { playNotificationSound } from "@/lib/notification-sounds";

import { replyToMessage, sendMessage } from "./api";
import { ComposeForm } from "./compose-form";
import {
  type ComposeDialogProps,
  composeContextLabel,
  composeTitle,
  type DraftSaveState,
  defaultSendingIdentity,
  draftStatus,
  findDraftForComposer,
  forwardedMessage,
  hasInvalidRecipients,
  normalizeDraftHtml,
  readDraftRecovery,
  replyRecipients,
  replySendingIdentity,
  sendingIdentities,
  splitRecipients
} from "./compose-state";
import { ComposeSurface } from "./compose-surface";
import { referencedInlineAttachmentIds } from "./email-images";
import { useDraftAutosave } from "./use-draft-autosave";

const emptyAutomaticSignature: SignatureSnapshot = {
  mode: "automatic",
  id: null,
  name: "",
  html: "",
  text: ""
};
const inlineImageDeleteDelayMs = 1_000;

export function ComposeDialog({
  defaultFromMailboxId = null,
  draftId = null,
  initialTo = "",
  mailboxes,
  message = null,
  mode = "new",
  open,
  presentation = "window",
  threadContext,
  onDraftsChange,
  onOpenChange,
  onSent
}: ComposeDialogProps): React.ReactElement | null {
  const identities = React.useMemo(() => sendingIdentities(mailboxes), [mailboxes]);
  const defaultIdentity = React.useMemo(
    () => defaultSendingIdentity(defaultFromMailboxId, identities),
    [defaultFromMailboxId, identities]
  );
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [cc, setCc] = React.useState("");
  const [bcc, setBcc] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [html, setHtml] = React.useState("<p></p>");
  const [text, setText] = React.useState("");
  const [attachments, setAttachments] = React.useState<DraftAttachment[]>([]);
  const [isPending, setIsPending] = React.useState(false);
  const [isSignaturePending, setIsSignaturePending] = React.useState(false);
  const [uploadCount, setUploadCount] = React.useState(0);
  const [saveState, setSaveState] = React.useState<DraftSaveState>("saved");
  const initialized = React.useRef(false);
  const generationRef = React.useRef(0);
  const draftRef = React.useRef<Draft | null>(null);
  const attachmentsRef = React.useRef<DraftAttachment[]>([]);
  const htmlRef = React.useRef(html);
  const uploadTokensRef = React.useRef(new Set<symbol>());
  const removingInlineIdsRef = React.useRef(new Set<string>());
  const inlineRemovalTimersRef = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mountedRef = React.useRef(true);
  const onDraftsChangeRef = React.useRef(onDraftsChange);
  const onOpenChangeRef = React.useRef(onOpenChange);
  onDraftsChangeRef.current = onDraftsChange;
  onOpenChangeRef.current = onOpenChange;
  const formId = React.useId();
  const replyToMessageId = mode === "reply" ? (message?.id ?? null) : null;
  const forwardOfMessageId = mode === "forward" ? (message?.id ?? null) : null;
  const contextLabel = composeContextLabel(mode, message);
  const recoveryKey = `hqbase:compose:${mode}:${draftId ?? message?.id ?? "new"}`;
  const { initializeAutosave, resetAutosave, saveFrom, saveSignature } = useDraftAutosave({
    open,
    initialized,
    draft,
    identities,
    recoveryKey,
    replyToMessageId,
    forwardOfMessageId,
    from,
    to,
    cc,
    bcc,
    subject,
    text,
    html,
    setDraft,
    setSaveState
  });
  draftRef.current = draft;
  attachmentsRef.current = attachments;
  htmlRef.current = html;

  const updateAttachments = React.useCallback(
    (update: (current: DraftAttachment[]) => DraftAttachment[]) => {
      setAttachments((current) => {
        const next = update(current);
        attachmentsRef.current = next;
        return next;
      });
    },
    []
  );

  const clearInlineRemovalTimers = React.useCallback(() => {
    for (const timer of inlineRemovalTimersRef.current.values()) clearTimeout(timer);
    inlineRemovalTimersRef.current.clear();
  }, []);

  const invalidateComposer = React.useCallback(() => {
    generationRef.current += 1;
    uploadTokensRef.current.clear();
    clearInlineRemovalTimers();
    setUploadCount(0);
  }, [clearInlineRemovalTimers]);

  const beginUpload = React.useCallback((): symbol => {
    const token = Symbol("compose-upload");
    uploadTokensRef.current.add(token);
    setUploadCount(uploadTokensRef.current.size);
    return token;
  }, []);

  const finishUpload = React.useCallback((token: symbol): void => {
    uploadTokensRef.current.delete(token);
    if (mountedRef.current) setUploadCount(uploadTokensRef.current.size);
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      uploadTokensRef.current.clear();
      clearInlineRemovalTimers();
    };
  }, [clearInlineRemovalTimers]);

  React.useEffect(() => {
    const generation = ++generationRef.current;
    uploadTokensRef.current.clear();
    removingInlineIdsRef.current.clear();
    clearInlineRemovalTimers();
    setUploadCount(0);
    if (!open) return;
    initialized.current = false;
    void (async () => {
      try {
        const drafts = await listDrafts();
        if (generation !== generationRef.current) return;
        const existing = findDraftForComposer(
          drafts,
          draftId,
          replyToMessageId,
          forwardOfMessageId
        );
        if (draftId && !existing) {
          throw new Error("Draft not found.");
        }
        const forwarded = mode === "forward" && message ? forwardedMessage(message) : null;
        const preferredIdentity =
          mode === "reply" && message
            ? replySendingIdentity(message, identities, defaultIdentity)
            : defaultIdentity;
        const initial =
          existing ??
          (await createDraft({
            mailboxId: preferredIdentity?.mailboxId ?? null,
            replyToMessageId,
            forwardOfMessageId,
            from: preferredIdentity?.address ?? "",
            to:
              mode === "reply" && message
                ? replyRecipients(message)
                : mode === "new" && initialTo
                  ? [initialTo]
                  : [],
            cc: [],
            bcc: [],
            subject:
              mode === "reply" && message
                ? `Re: ${message.subject.replace(/^re:\s*/i, "")}`
                : mode === "forward" && message
                  ? `Fwd: ${message.subject.replace(/^(fw|fwd):\s*/i, "")}`
                  : "",
            text: forwarded?.text ?? "",
            html: forwarded?.html ?? "<p></p>",
            signature: { mode: "automatic" }
          }));
        if (generation !== generationRef.current) return;
        if (!existing) onDraftsChangeRef.current?.();
        const recovered = readDraftRecovery(recoveryKey, initial.updatedAt);
        draftRef.current = initial;
        setDraft(initial);
        initializeAutosave(initial);
        setFrom(recovered?.from ?? initial.from);
        setTo(recovered?.to ?? initial.to.join(", "));
        setCc(recovered?.cc ?? initial.cc.join(", "));
        setBcc(recovered?.bcc ?? initial.bcc.join(", "));
        setSubject(recovered?.subject ?? initial.subject);
        setText(recovered?.text ?? initial.text);
        const initialHtml = recovered?.html ?? (initial.html || "<p></p>");
        htmlRef.current = initialHtml;
        setHtml(initialHtml);
        attachmentsRef.current = initial.attachments;
        setAttachments(initial.attachments);
        setSaveState("saved");
        initialized.current = true;
      } catch (error) {
        if (generation !== generationRef.current) return;
        toast.error(error instanceof Error ? error.message : "Draft could not be opened.");
        if (draftId) onOpenChangeRef.current(false);
      }
    })();
  }, [
    open,
    message,
    mode,
    identities,
    defaultIdentity,
    draftId,
    initialTo,
    recoveryKey,
    replyToMessageId,
    forwardOfMessageId,
    initializeAutosave,
    clearInlineRemovalTimers
  ]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || uploadCount > 0 || isSignaturePending || hasInvalidRecipients(to, cc, bcc))
      return;
    setIsPending(true);
    try {
      const referencedInlineIds = referencedInlineAttachmentIds(html, draft.id);
      const common = {
        from,
        text,
        html: normalizeDraftHtml(text, html),
        attachmentIds: attachments
          .filter((attachment) => !attachment.inline || referencedInlineIds.has(attachment.id))
          .map((attachment) => attachment.id),
        draftId: draft.id
      };
      if (mode === "reply" && message) {
        await replyToMessage({
          ...common,
          messageId: message.id,
          to: splitRecipients(to),
          cc: splitRecipients(cc),
          bcc: splitRecipients(bcc)
        });
      } else {
        await sendMessage({
          ...common,
          to: splitRecipients(to),
          cc: splitRecipients(cc),
          bcc: splitRecipients(bcc),
          subject
        });
      }
      playNotificationSound("outgoing-email");
      toast.success(mode === "reply" ? "Reply sent." : "Message sent.", {
        id: `outgoing-email:${draft.id}`
      });
      invalidateComposer();
      initialized.current = false;
      draftRef.current = null;
      setDraft(null);
      resetAutosave();
      localStorage.removeItem(recoveryKey);
      onOpenChangeRef.current(false);
      onDraftsChange?.();
      onSent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sending failed.");
    } finally {
      setIsPending(false);
    }
  }

  async function changeFrom(nextFrom: string): Promise<void> {
    if (nextFrom === from) return;
    const previousFrom = from;
    setFrom(nextFrom);
    setIsSignaturePending(true);
    try {
      await saveFrom(nextFrom);
    } catch (error) {
      setFrom(previousFrom);
      toast.error(error instanceof Error ? error.message : "From address could not be changed.");
    } finally {
      setIsSignaturePending(false);
    }
  }

  const upload = React.useCallback(
    async (files: File[]) => {
      const activeDraft = draftRef.current;
      if (!activeDraft || files.length === 0) return;
      const generation = generationRef.current;
      const token = beginUpload();
      let added = false;
      try {
        for (const file of files) {
          if (generation !== generationRef.current || draftRef.current?.id !== activeDraft.id)
            break;
          const item = await uploadDraftAttachment(activeDraft.id, file);
          if (generation !== generationRef.current || draftRef.current?.id !== activeDraft.id) {
            await deleteDraftAttachment(activeDraft.id, item.id).catch(() => undefined);
            break;
          }
          updateAttachments((current) => [...current, item]);
          added = true;
        }
        if (added) toast.success("Attachment added.");
      } catch (error) {
        if (generation === generationRef.current) {
          toast.error(error instanceof Error ? error.message : "Upload failed.");
        }
      } finally {
        finishUpload(token);
      }
    },
    [beginUpload, finishUpload, updateAttachments]
  );
  const uploadImages = React.useCallback(
    async (files: File[]) => {
      const activeDraft = draftRef.current;
      if (!activeDraft || files.length === 0) return [];
      const generation = generationRef.current;
      const token = beginUpload();
      const images = [];
      let failed = false;
      try {
        for (const file of files) {
          if (generation !== generationRef.current || draftRef.current?.id !== activeDraft.id)
            break;
          try {
            const item = await uploadDraftAttachment(activeDraft.id, file, true);
            if (generation !== generationRef.current || draftRef.current?.id !== activeDraft.id) {
              await deleteDraftAttachment(activeDraft.id, item.id).catch(() => undefined);
              break;
            }
            updateAttachments((current) => [...current, item]);
            images.push({
              alt: file.name || "Image",
              src: `/api/v2/drafts/${encodeURIComponent(activeDraft.id)}/attachments/${encodeURIComponent(item.id)}/inline`
            });
          } catch {
            failed = true;
          }
        }
        if (generation === generationRef.current) {
          if (images.length) toast.success(images.length === 1 ? "Image added." : "Images added.");
          if (failed) toast.error("Some images could not be uploaded.");
        }
        return images;
      } finally {
        finishUpload(token);
      }
    },
    [beginUpload, finishUpload, updateAttachments]
  );
  async function removeAttachment(item: DraftAttachment) {
    if (!draft) return;
    await deleteDraftAttachment(draft.id, item.id);
    updateAttachments((current) => current.filter((attachment) => attachment.id !== item.id));
  }

  function removeUnreferencedInlineAttachments(nextHtml: string): void {
    const activeDraft = draftRef.current;
    if (!activeDraft) return;
    htmlRef.current = nextHtml;
    const referencedIds = referencedInlineAttachmentIds(nextHtml, activeDraft.id);
    for (const item of attachmentsRef.current) {
      if (!item.inline) continue;
      const existingTimer = inlineRemovalTimersRef.current.get(item.id);
      if (referencedIds.has(item.id)) {
        if (existingTimer !== undefined) clearTimeout(existingTimer);
        inlineRemovalTimersRef.current.delete(item.id);
        continue;
      }
      if (existingTimer !== undefined || removingInlineIdsRef.current.has(item.id)) continue;
      const generation = generationRef.current;
      const timer = setTimeout(() => {
        inlineRemovalTimersRef.current.delete(item.id);
        if (
          generation !== generationRef.current ||
          draftRef.current?.id !== activeDraft.id ||
          referencedInlineAttachmentIds(htmlRef.current, activeDraft.id).has(item.id)
        )
          return;
        removingInlineIdsRef.current.add(item.id);
        void deleteDraftAttachment(activeDraft.id, item.id)
          .then(() => {
            removingInlineIdsRef.current.delete(item.id);
            if (generation === generationRef.current && draftRef.current?.id === activeDraft.id) {
              updateAttachments((current) =>
                current.filter((attachment) => attachment.id !== item.id)
              );
            }
          })
          .catch((error: unknown) => {
            removingInlineIdsRef.current.delete(item.id);
            if (generation === generationRef.current) {
              toast.error(error instanceof Error ? error.message : "Image could not be removed.");
            }
          });
      }, inlineImageDeleteDelayMs);
      inlineRemovalTimersRef.current.set(item.id, timer);
    }
  }

  async function discard() {
    invalidateComposer();
    if (draft) await deleteDraft(draft.id);
    initialized.current = false;
    draftRef.current = null;
    setDraft(null);
    resetAutosave();
    localStorage.removeItem(recoveryKey);
    onOpenChangeRef.current(false);
    onDraftsChange?.();
  }

  if (!open) return null;
  const sendDisabled =
    isPending ||
    isSignaturePending ||
    uploadCount > 0 ||
    !draft ||
    identities.length === 0 ||
    !text.trim() ||
    splitRecipients(to).length === 0 ||
    hasInvalidRecipients(to, cc, bcc);
  const content = (
    <ComposeForm
      attachments={attachments}
      bcc={bcc}
      cc={cc}
      contextLabel={contextLabel}
      formId={formId}
      from={from}
      fromDisabled={isSignaturePending}
      html={html}
      identities={identities}
      isPending={isPending}
      mode={mode}
      presentation={presentation}
      ready={Boolean(draft && initialized.current)}
      sendDisabled={sendDisabled}
      signatureDisabled={isSignaturePending}
      signature={draft?.signature ?? emptyAutomaticSignature}
      subject={subject}
      threadContext={threadContext}
      to={to}
      onDiscard={() => void discard()}
      onEditorChange={(nextHtml, nextText) => {
        removeUnreferencedInlineAttachments(nextHtml);
        htmlRef.current = nextHtml;
        setHtml(nextHtml);
        setText(nextText);
      }}
      onFiles={upload}
      onImages={uploadImages}
      onRemoveAttachment={(item) => void removeAttachment(item)}
      onManageSignatures={() => window.location.assign("/settings/signatures")}
      onSetBcc={setBcc}
      onSetCc={setCc}
      onSetFrom={(nextFrom) => void changeFrom(nextFrom)}
      onSetSubject={setSubject}
      onSetSignature={async (selection) => {
        setIsSignaturePending(true);
        try {
          await saveSignature(selection);
        } finally {
          setIsSignaturePending(false);
        }
      }}
      onSetTo={setTo}
      onSubmit={(event) => void handleSubmit(event)}
    />
  );

  return (
    <ComposeSurface
      formId={formId}
      open={open}
      presentation={presentation}
      sendDisabled={sendDisabled}
      status={draftStatus(saveState)}
      title={composeTitle(mode)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) invalidateComposer();
        onOpenChangeRef.current(nextOpen);
      }}
    >
      {content}
    </ComposeSurface>
  );
}

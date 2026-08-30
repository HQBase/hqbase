import * as React from "react";
import { toast } from "sonner";

import { createDraft, deleteDraft, listDrafts } from "@/features/drafts/api";
import type { Draft } from "@/features/drafts/types";
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
  draftEditorHtml,
  draftRecoveryKey,
  draftStatus,
  findDraftForComposer,
  forwardedMessage,
  hasInvalidRecipients,
  legacyDraftRecoveryKey,
  migrateDraftRecovery,
  normalizeDraftHtml,
  readNewestDraftRecovery,
  replyRecipients,
  replySendingIdentity,
  sendingIdentities,
  splitRecipients
} from "./compose-state";
import { ComposeSurface } from "./compose-surface";
import { referencedInlineAttachmentIds } from "./email-images";
import { useComposeAttachments } from "./use-compose-attachments";
import { useDraftAutosave } from "./use-draft-autosave";

const emptyAutomaticSignature: SignatureSnapshot = {
  mode: "automatic",
  id: null,
  name: "",
  html: "",
  text: ""
};
export function ComposeDialog({
  defaultFromMailboxId = null,
  dockIndex = 0,
  dockTarget = null,
  draftId = null,
  initialTo = "",
  inlineTarget = null,
  mailboxes,
  message = null,
  minimized,
  mode = "new",
  open,
  presentation = "window",
  threadContext,
  threadMessages = [],
  windowSlot = 0,
  onDetach,
  onDraftReady,
  onDraftsChange,
  onManageSignatures,
  onMinimizedChange,
  onOpenChange,
  onReturnToThread,
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
  const [isPending, setIsPending] = React.useState(false);
  const [isSignaturePending, setIsSignaturePending] = React.useState(false);
  const [saveState, setSaveState] = React.useState<DraftSaveState>("saved");
  const initialized = React.useRef(false);
  const generationRef = React.useRef(0);
  const draftRef = React.useRef<Draft | null>(null);
  const htmlRef = React.useRef(html);
  const onDraftReadyRef = React.useRef(onDraftReady);
  const onDraftsChangeRef = React.useRef(onDraftsChange);
  const onOpenChangeRef = React.useRef(onOpenChange);
  onDraftReadyRef.current = onDraftReady;
  onDraftsChangeRef.current = onDraftsChange;
  onOpenChangeRef.current = onOpenChange;
  const formId = React.useId();
  const replyToMessageId = mode === "reply" ? (message?.id ?? null) : null;
  const forwardOfMessageId = mode === "forward" ? (message?.id ?? null) : null;
  const contextLabel = composeContextLabel(mode, message);
  const recoveryKey = draft ? draftRecoveryKey(draft.id) : "";
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
  htmlRef.current = html;
  const {
    attachments,
    uploadCount,
    invalidate: invalidateComposer,
    removeAttachment,
    removeUnreferencedInlineAttachments,
    replaceAttachments,
    startSession,
    upload,
    uploadImages
  } = useComposeAttachments({ draftRef, generationRef, htmlRef });

  React.useEffect(() => {
    const generation = startSession();
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
        const exactRecoveryKey = draftRecoveryKey(initial.id);
        const legacyRecoveryKey = legacyDraftRecoveryKey(mode, draftId, message?.id ?? null);
        const recovered = readNewestDraftRecovery(
          [exactRecoveryKey, legacyRecoveryKey],
          initial.updatedAt
        );
        migrateDraftRecovery(exactRecoveryKey, legacyRecoveryKey, recovered);
        const initialText = recovered?.text ?? initial.text;
        const initialHtml = draftEditorHtml(initialText, recovered?.html ?? initial.html);
        draftRef.current = initial;
        setDraft(initial);
        onDraftReadyRef.current?.(initial.id);
        initializeAutosave(
          recovered ? initial : { ...initial, text: initialText, html: initialHtml }
        );
        setFrom(recovered?.from ?? initial.from);
        setTo(recovered?.to ?? initial.to.join(", "));
        setCc(recovered?.cc ?? initial.cc.join(", "));
        setBcc(recovered?.bcc ?? initial.bcc.join(", "));
        setSubject(recovered?.subject ?? initial.subject);
        setText(initialText);
        htmlRef.current = initialHtml;
        setHtml(initialHtml);
        replaceAttachments(initial.attachments);
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
    replyToMessageId,
    forwardOfMessageId,
    initializeAutosave,
    replaceAttachments,
    startSession
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
      includedAttachments={mode === "forward" ? (message?.attachments ?? []) : []}
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
      replyMessage={mode === "reply" ? message : null}
      replyMessages={
        mode === "reply" && message ? (threadMessages.length > 0 ? threadMessages : [message]) : []
      }
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
      onManageSignatures={
        onManageSignatures ?? (() => window.location.assign("/settings/signatures"))
      }
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
      dockIndex={dockIndex}
      dockTarget={dockTarget}
      formId={formId}
      inlineTarget={inlineTarget}
      minimized={minimized}
      open={open}
      presentation={presentation}
      sendDisabled={sendDisabled}
      status={draftStatus(saveState)}
      title={composeTitle(mode)}
      windowSlot={windowSlot}
      onDetach={onDetach}
      onMinimizedChange={onMinimizedChange}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) invalidateComposer();
        onOpenChangeRef.current(nextOpen);
      }}
      onReturnToThread={onReturnToThread}
    >
      {content}
    </ComposeSurface>
  );
}

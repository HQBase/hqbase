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
  const [isUploading, setIsUploading] = React.useState(false);
  const [saveState, setSaveState] = React.useState<DraftSaveState>("saved");
  const initialized = React.useRef(false);
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

  React.useEffect(() => {
    if (!open) return;
    initialized.current = false;
    void (async () => {
      try {
        const drafts = await listDrafts();
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
        if (!existing) onDraftsChangeRef.current?.();
        const recovered = readDraftRecovery(recoveryKey, initial.updatedAt);
        setDraft(initial);
        initializeAutosave(initial);
        setFrom(recovered?.from ?? initial.from);
        setTo(recovered?.to ?? initial.to.join(", "));
        setCc(recovered?.cc ?? initial.cc.join(", "));
        setBcc(recovered?.bcc ?? initial.bcc.join(", "));
        setSubject(recovered?.subject ?? initial.subject);
        setText(recovered?.text ?? initial.text);
        setHtml(recovered?.html ?? (initial.html || "<p></p>"));
        setAttachments(initial.attachments);
        setSaveState("saved");
        initialized.current = true;
      } catch (error) {
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
    initializeAutosave
  ]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || isSignaturePending || hasInvalidRecipients(to, cc, bcc)) return;
    setIsPending(true);
    try {
      const common = {
        from,
        text,
        html: normalizeDraftHtml(text, html),
        attachmentIds: attachments.map((attachment) => attachment.id),
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
      initialized.current = false;
      setDraft(null);
      resetAutosave();
      localStorage.removeItem(recoveryKey);
      onOpenChange(false);
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
      if (!draft || files.length === 0) return;
      setIsUploading(true);
      try {
        for (const file of files) {
          const item = await uploadDraftAttachment(draft.id, file);
          setAttachments((current) => [...current, item]);
        }
        toast.success("Attachment added.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.");
      } finally {
        setIsUploading(false);
      }
    },
    [draft]
  );
  async function removeAttachment(item: DraftAttachment) {
    if (!draft) return;
    await deleteDraftAttachment(draft.id, item.id);
    setAttachments((current) => current.filter((attachment) => attachment.id !== item.id));
  }

  async function discard() {
    if (draft) await deleteDraft(draft.id);
    initialized.current = false;
    setDraft(null);
    resetAutosave();
    localStorage.removeItem(recoveryKey);
    onOpenChange(false);
    onDraftsChange?.();
  }

  if (!open) return null;
  const sendDisabled =
    isPending ||
    isSignaturePending ||
    isUploading ||
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
        setHtml(nextHtml);
        setText(nextText);
      }}
      onFiles={(files) => void upload(files)}
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
      onOpenChange={onOpenChange}
    >
      {content}
    </ComposeSurface>
  );
}

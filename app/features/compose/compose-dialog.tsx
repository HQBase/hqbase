import * as React from "react";
import { toast } from "sonner";

import {
  createDraft,
  type Draft,
  type DraftAttachment,
  deleteDraft,
  deleteDraftAttachment,
  listDrafts,
  replyToMessage,
  sendMessage,
  updateDraft,
  uploadDraftAttachment
} from "./api";
import { ComposeForm } from "./compose-form";
import {
  type ComposeDialogProps,
  composeTitle,
  type DraftSaveState,
  draftStatus,
  forwardedMessage,
  readDraftRecovery,
  sendingIdentities,
  serializeDraft,
  splitRecipients
} from "./compose-state";
import { ComposeSurface } from "./compose-surface";

export function ComposeDialog({
  mailboxes,
  message = null,
  mode = "new",
  open,
  presentation = "window",
  threadContext,
  onOpenChange,
  onSent
}: ComposeDialogProps): React.ReactElement | null {
  const identities = React.useMemo(() => sendingIdentities(mailboxes), [mailboxes]);
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
  const [isUploading, setIsUploading] = React.useState(false);
  const [saveState, setSaveState] = React.useState<DraftSaveState>("saved");
  const initialized = React.useRef(false);
  const lastSaved = React.useRef("");
  const formId = React.useId();
  const replyToMessageId = mode === "reply" ? (message?.id ?? null) : null;
  const forwardOfMessageId = mode === "forward" ? (message?.id ?? null) : null;
  const recoveryKey = `hqbase:compose:${mode}:${message?.id ?? "new"}`;

  React.useEffect(() => {
    if (!open) return;
    initialized.current = false;
    void (async () => {
      try {
        const drafts = await listDrafts();
        const existing =
          drafts.find(
            (item) =>
              item.replyToMessageId === replyToMessageId &&
              item.forwardOfMessageId === forwardOfMessageId
          ) ?? null;
        const forwarded = mode === "forward" && message ? forwardedMessage(message) : null;
        const initial =
          existing ??
          (await createDraft({
            mailboxId: identities[0]?.mailboxId ?? null,
            replyToMessageId,
            forwardOfMessageId,
            from: identities[0]?.address ?? "",
            to: mode === "reply" && message ? [message.fromAddress] : [],
            cc: [],
            bcc: [],
            subject:
              mode === "reply" && message
                ? `Re: ${message.subject.replace(/^re:\s*/i, "")}`
                : mode === "forward" && message
                  ? `Fwd: ${message.subject.replace(/^(fw|fwd):\s*/i, "")}`
                  : "",
            text: forwarded?.text ?? "",
            html: forwarded?.html ?? "<p></p>"
          }));
        const recovered = readDraftRecovery(recoveryKey, initial.updatedAt);
        setDraft(initial);
        setFrom(recovered?.from ?? initial.from);
        setTo(recovered?.to ?? initial.to.join(", "));
        setCc(recovered?.cc ?? initial.cc.join(", "));
        setBcc(recovered?.bcc ?? initial.bcc.join(", "));
        setSubject(recovered?.subject ?? initial.subject);
        setText(recovered?.text ?? initial.text);
        setHtml(recovered?.html ?? (initial.html || "<p></p>"));
        setAttachments(initial.attachments);
        lastSaved.current = serializeDraft(
          initial.from,
          initial.to.join(", "),
          initial.cc.join(", "),
          initial.bcc.join(", "),
          initial.subject,
          initial.text,
          initial.html
        );
        setSaveState("saved");
        initialized.current = true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Draft could not be opened.");
      }
    })();
  }, [open, message, mode, identities, recoveryKey, replyToMessageId, forwardOfMessageId]);

  React.useEffect(() => {
    if (!open || !initialized.current) return;
    localStorage.setItem(
      recoveryKey,
      JSON.stringify({ from, to, cc, bcc, subject, text, html, savedAt: Date.now() })
    );
  }, [open, recoveryKey, from, to, cc, bcc, subject, text, html]);

  React.useEffect(() => {
    if (!open || !draft || !initialized.current) return;
    const snapshot = serializeDraft(from, to, cc, bcc, subject, text, html);
    if (snapshot === lastSaved.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void updateDraft(draft.id, {
        mailboxId: identities.find((identity) => identity.address === from)?.mailboxId ?? null,
        replyToMessageId,
        forwardOfMessageId,
        from,
        to: splitRecipients(to),
        cc: splitRecipients(cc),
        bcc: splitRecipients(bcc),
        subject,
        text,
        html,
        version: draft.version
      })
        .then((next) => {
          lastSaved.current = snapshot;
          localStorage.removeItem(recoveryKey);
          setDraft(next);
          setSaveState("saved");
        })
        .catch((error) => {
          setSaveState("error");
          toast.error(error instanceof Error ? error.message : "Draft save failed.");
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    open,
    draft,
    from,
    to,
    cc,
    bcc,
    subject,
    text,
    html,
    replyToMessageId,
    forwardOfMessageId,
    identities,
    recoveryKey
  ]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setIsPending(true);
    try {
      const common = {
        from,
        text,
        html,
        attachmentIds: attachments.map((attachment) => attachment.id),
        draftId: draft.id
      };
      if (mode === "reply" && message) {
        await replyToMessage({ ...common, messageId: message.id });
      } else {
        await sendMessage({
          ...common,
          to: splitRecipients(to),
          cc: splitRecipients(cc),
          bcc: splitRecipients(bcc),
          subject
        });
      }
      toast.success(mode === "reply" ? "Reply sent." : "Message sent.");
      initialized.current = false;
      setDraft(null);
      localStorage.removeItem(recoveryKey);
      onOpenChange(false);
      onSent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sending failed.");
    } finally {
      setIsPending(false);
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
    localStorage.removeItem(recoveryKey);
    onOpenChange(false);
  }

  if (!open) return null;
  const sendDisabled =
    isPending ||
    isUploading ||
    !draft ||
    identities.length === 0 ||
    !text.trim() ||
    (mode !== "reply" && splitRecipients(to).length === 0);
  const content = (
    <ComposeForm
      attachments={attachments}
      bcc={bcc}
      cc={cc}
      formId={formId}
      from={from}
      html={html}
      identities={identities}
      isPending={isPending}
      message={message}
      mode={mode}
      presentation={presentation}
      ready={Boolean(draft && initialized.current)}
      sendDisabled={sendDisabled}
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
      onSetBcc={setBcc}
      onSetCc={setCc}
      onSetFrom={setFrom}
      onSetSubject={setSubject}
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

import { Paperclip, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
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
import { AttachmentList } from "./attachment-list";
import { ComposeFields } from "./compose-fields";
import {
  type ComposeDialogProps,
  readDraftRecovery,
  sendingIdentities,
  serializeDraft,
  splitRecipients
} from "./compose-state";
import { RichEmailEditor } from "./rich-email-editor";

export function ComposeDialog({
  mailboxes,
  open,
  replyTo,
  onOpenChange,
  onSent
}: ComposeDialogProps): React.ReactElement {
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
  const [saveState, setSaveState] = React.useState<"saved" | "saving" | "error">("saved");
  const initialized = React.useRef(false);
  const lastSaved = React.useRef("");
  const recoveryKey = `hqbase:compose:${replyTo?.id ?? "new"}`;

  React.useEffect(() => {
    if (!open) return;
    initialized.current = false;
    void (async () => {
      try {
        const drafts = await listDrafts();
        const existing = drafts.find((d) => d.replyToMessageId === (replyTo?.id ?? null)) ?? null;
        const initial =
          existing ??
          (await createDraft({
            mailboxId: identities[0]?.mailboxId ?? null,
            replyToMessageId: replyTo?.id ?? null,
            from: identities[0]?.address ?? "",
            to: replyTo ? [replyTo.fromAddress] : [],
            cc: [],
            bcc: [],
            subject: replyTo ? `Re: ${replyTo.subject.replace(/^re:\s*/i, "")}` : "",
            text: "",
            html: "<p></p>"
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
  }, [open, replyTo, identities, recoveryKey]);

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
        mailboxId: identities.find((i) => i.address === from)?.mailboxId ?? null,
        replyToMessageId: replyTo?.id ?? null,
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
  }, [open, draft, from, to, cc, bcc, subject, text, html, replyTo, identities, recoveryKey]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setIsPending(true);
    try {
      const common = {
        from,
        text,
        html,
        attachmentIds: attachments.map((a) => a.id),
        draftId: draft.id
      };
      if (replyTo) await replyToMessage({ ...common, messageId: replyTo.id });
      else
        await sendMessage({
          ...common,
          to: splitRecipients(to),
          cc: splitRecipients(cc),
          bcc: splitRecipients(bcc),
          subject
        });
      toast.success("Message sent.");
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
  const handleEditorFiles = React.useCallback((files: File[]) => void upload(files), [upload]);
  async function removeAttachment(item: DraftAttachment) {
    if (!draft) return;
    await deleteDraftAttachment(draft.id, item.id);
    setAttachments((current) => current.filter((a) => a.id !== item.id));
  }
  async function discard() {
    if (draft) await deleteDraft(draft.id);
    initialized.current = false;
    setDraft(null);
    localStorage.removeItem(recoveryKey);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden bg-card p-0 shadow-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base font-medium">
            {replyTo ? "Reply" : "New message"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {saveState === "saving"
              ? "Saving draft…"
              : saveState === "error"
                ? "Draft not saved"
                : "Draft saved"}
          </DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void handleSubmit(e)}>
          <ComposeFields
            identities={identities}
            replyTo={replyTo}
            from={from}
            to={to}
            cc={cc}
            bcc={bcc}
            subject={subject}
            setFrom={setFrom}
            setTo={setTo}
            setCc={setCc}
            setBcc={setBcc}
            setSubject={setSubject}
          />
          <RichEmailEditor
            html={html}
            onFiles={handleEditorFiles}
            onChange={(nextHtml, nextText) => {
              setHtml(nextHtml);
              setText(nextText);
            }}
          />
          <AttachmentList
            attachments={attachments}
            onRemove={(item) => void removeAttachment(item)}
          />
          <DialogFooter className="justify-between border-t bg-background/50 px-5 py-3 sm:justify-between">
            <div className="flex gap-2">
              <Button
                disabled={
                  isPending || isUploading || !draft || identities.length === 0 || !text.trim()
                }
                type="submit"
              >
                {isPending ? "Sending" : "Send"}
              </Button>
              <Button asChild size="icon" type="button" variant="ghost">
                <label aria-label="Add attachment" className="cursor-pointer">
                  <Paperclip />
                  <input
                    className="sr-only"
                    multiple
                    type="file"
                    onChange={(e) => {
                      void upload(Array.from(e.target.files ?? []));
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>
            <Button
              aria-label="Discard draft"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => void discard()}
            >
              <Trash2 />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

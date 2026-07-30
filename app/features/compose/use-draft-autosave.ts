import * as React from "react";
import { toast } from "sonner";
import { updateDraft } from "@/features/drafts/api";
import type { Draft } from "@/features/drafts/types";
import type { SendingIdentity } from "./compose-fields";
import {
  type DraftSaveState,
  normalizeDraftHtml,
  serializeDraft,
  splitRecipients
} from "./compose-state";
import { DraftSaveQueue } from "./draft-save-queue";

type DraftAutosaveOptions = {
  open: boolean;
  initialized: React.RefObject<boolean>;
  draft: Draft | null;
  identities: SendingIdentity[];
  recoveryKey: string;
  replyToMessageId: string | null;
  forwardOfMessageId: string | null;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  html: string;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  setSaveState: React.Dispatch<React.SetStateAction<DraftSaveState>>;
};

export function useDraftAutosave(options: DraftAutosaveOptions) {
  const {
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
  } = options;
  const draftRef = React.useRef<Draft | null>(null);
  const lastSaved = React.useRef("");
  const latestSnapshot = React.useRef("");
  const saveQueue = React.useRef(new DraftSaveQueue());

  const initializeAutosave = React.useCallback((initial: Draft) => {
    draftRef.current = initial;
    lastSaved.current = serializeDraft(
      initial.from,
      initial.to.join(", "),
      initial.cc.join(", "),
      initial.bcc.join(", "),
      initial.subject,
      initial.text,
      initial.html
    );
    latestSnapshot.current = lastSaved.current;
  }, []);

  const resetAutosave = React.useCallback(() => {
    draftRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!open || !initialized.current) return;
    localStorage.setItem(
      recoveryKey,
      JSON.stringify({ from, to, cc, bcc, subject, text, html, savedAt: Date.now() })
    );
  }, [open, initialized, recoveryKey, from, to, cc, bcc, subject, text, html]);

  React.useEffect(() => {
    if (!open || !draft || !initialized.current) return;
    const snapshot = serializeDraft(from, to, cc, bcc, subject, text, html);
    latestSnapshot.current = snapshot;
    if (snapshot === lastSaved.current) {
      setSaveState("saved");
      return;
    }
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void saveQueue.current.enqueue(async () => {
        const current = draftRef.current;
        if (
          !current ||
          !initialized.current ||
          snapshot !== latestSnapshot.current ||
          snapshot === lastSaved.current
        ) {
          if (latestSnapshot.current === lastSaved.current) setSaveState("saved");
          return;
        }
        try {
          const next = await updateDraft(current.id, {
            mailboxId: identities.find((identity) => identity.address === from)?.mailboxId ?? null,
            replyToMessageId,
            forwardOfMessageId,
            from,
            to: splitRecipients(to),
            cc: splitRecipients(cc),
            bcc: splitRecipients(bcc),
            subject,
            text,
            html: normalizeDraftHtml(text, html),
            version: current.version
          });
          draftRef.current = next;
          lastSaved.current = snapshot;
          localStorage.removeItem(recoveryKey);
          setDraft(next);
          setSaveState(latestSnapshot.current === snapshot ? "saved" : "saving");
        } catch (error) {
          setSaveState("error");
          toast.error(error instanceof Error ? error.message : "Draft save failed.");
        }
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    open,
    initialized,
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
    recoveryKey,
    setDraft,
    setSaveState
  ]);

  return { initializeAutosave, resetAutosave };
}

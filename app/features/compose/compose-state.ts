import type * as React from "react";
import type { Draft } from "@/features/drafts/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { MessageDetail } from "@/features/messages/types";
import { formatDateTime } from "@/lib/format";
import type { SendingIdentity } from "./compose-fields";

export type ComposeMode = "new" | "reply" | "forward";
export type DraftSaveState = "saved" | "saving" | "error";

export type ComposeDialogProps = {
  defaultFromMailboxId?: string | null;
  draftId?: Draft["id"] | null;
  mailboxes: Mailbox[];
  message?: MessageDetail | null;
  mode?: ComposeMode;
  open: boolean;
  presentation?: "window" | "thread";
  threadContext?: React.ReactNode;
  onDraftsChange?: () => void;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
};

export function findDraftForComposer(
  drafts: Draft[],
  draftId: string | null,
  replyToMessageId: string | null,
  forwardOfMessageId: string | null
): Draft | null {
  return (
    (draftId
      ? drafts.find((draft) => draft.id === draftId)
      : drafts.find(
          (draft) =>
            draft.replyToMessageId === replyToMessageId &&
            draft.forwardOfMessageId === forwardOfMessageId
        )) ?? null
  );
}

export const splitRecipients = (value: string) =>
  value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

export function replySendingIdentity(
  message: MessageDetail,
  identities: SendingIdentity[],
  defaultIdentity: SendingIdentity | null = null
): SendingIdentity | null {
  const addresses = [message.deliveredToAddress, ...message.to].filter(
    (address): address is string => Boolean(address)
  );
  for (const address of addresses) {
    const identity = identities.find(
      (candidate) => candidate.address.toLowerCase() === address.toLowerCase()
    );
    if (identity) return identity;
  }
  return (
    identities.find((identity) => identity.mailboxId === message.mailboxId) ??
    defaultIdentity ??
    identities[0] ??
    null
  );
}

export function defaultSendingIdentity(
  defaultFromMailboxId: string | null,
  mailboxes: Mailbox[],
  identities: SendingIdentity[]
): SendingIdentity | null {
  const mailbox = mailboxes.find((candidate) => candidate.id === defaultFromMailboxId);
  const primaryAddress =
    mailbox?.addresses.find((address) => address.isPrimary && address.sendEnabled)?.address ??
    (mailbox?.addresses.length === 0 ? mailbox.address : null);
  return (
    identities.find(
      (identity) =>
        identity.mailboxId === defaultFromMailboxId && identity.address === primaryAddress
    ) ??
    identities[0] ??
    null
  );
}

export function sendingIdentities(mailboxes: Mailbox[]): SendingIdentity[] {
  return mailboxes
    .filter(
      (mailbox) =>
        mailbox.isActive && (mailbox.accessLevel === "agent" || mailbox.accessLevel === "manager")
    )
    .flatMap((mailbox) =>
      mailbox.addresses?.length
        ? mailbox.addresses
            .filter((address) => address.sendEnabled)
            .map((address) => ({ mailboxId: mailbox.id, address: address.address }))
        : [{ mailboxId: mailbox.id, address: mailbox.address }]
    );
}

export const serializeDraft = (
  from: string,
  to: string,
  cc: string,
  bcc: string,
  subject: string,
  text: string,
  html: string
) => JSON.stringify({ from, to, cc, bcc, subject, text, html: normalizeDraftHtml(text, html) });

export function normalizeDraftHtml(text: string, html: string): string {
  return text.trim() ? html : "";
}

type Recovery = {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  html: string;
  savedAt: number;
};
export function readDraftRecovery(key: string, serverUpdatedAt: string): Recovery | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<Recovery> | null;
    return value && typeof value.savedAt === "number" && value.savedAt > Date.parse(serverUpdatedAt)
      ? (value as Recovery)
      : null;
  } catch {
    return null;
  }
}

export function composeTitle(mode: ComposeMode): string {
  return mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New message";
}

export function draftStatus(state: DraftSaveState): string {
  return state === "saving"
    ? "Saving draft…"
    : state === "error"
      ? "Draft not saved"
      : "Draft saved";
}

export function forwardedMessage(message: MessageDetail): { html: string; text: string } {
  const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
  const lines = [
    "---------- Forwarded message ---------",
    `From: ${message.fromAddress}`,
    `Date: ${formatDateTime(timestamp)}`,
    `Subject: ${message.subject}`,
    `To: ${message.to.join(", ")}`,
    ...(message.cc.length ? [`Cc: ${message.cc.join(", ")}`] : []),
    "",
    message.textBody || message.snippet
  ];
  const text = lines.join("\n");
  return {
    text,
    html: `<p></p><blockquote>${escapeHtml(text).replaceAll("\n", "<br>")}</blockquote>`
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

import type * as React from "react";
import { z } from "zod";
import type { Draft } from "@/features/drafts/types";
import type { Mailbox } from "@/features/mailboxes/types";
import type { MessageDetail } from "@/features/messages/types";
import { formatDateTime } from "@/lib/format";
import type { SendingIdentity } from "./compose-fields";

export type ComposeMode = "new" | "reply" | "forward";
export type DraftSaveState = "saved" | "saving" | "local" | "error";

export type ComposeDialogProps = {
  defaultFromMailboxId?: string | null;
  draftId?: Draft["id"] | null;
  initialTo?: string;
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

const recipientSchema = z.string().trim().email().max(254);

export function invalidRecipients(value: string): string[] {
  return splitRecipients(value).filter(
    (recipient) => !recipientSchema.safeParse(recipient).success
  );
}

export function hasInvalidRecipients(...values: string[]): boolean {
  return values.some((value) => invalidRecipients(value).length > 0);
}

export function replyRecipients(message: MessageDetail): string[] {
  if (message.direction === "inbound") return [message.fromAddress];

  const sender = message.fromAddress.toLowerCase();
  return message.to.filter((address) => address.toLowerCase() !== sender);
}

export function replySendingIdentity(
  message: MessageDetail,
  identities: SendingIdentity[],
  defaultIdentity: SendingIdentity | null = null
): SendingIdentity | null {
  return (
    identities.find((identity) => identity.mailboxId === message.mailboxId) ??
    defaultIdentity ??
    identities[0] ??
    null
  );
}

export function defaultSendingIdentity(
  defaultFromMailboxId: string | null,
  identities: SendingIdentity[]
): SendingIdentity | null {
  return (
    identities.find((identity) => identity.mailboxId === defaultFromMailboxId) ??
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
    .map((mailbox) => ({
      mailboxId: mailbox.id,
      address: mailbox.address,
      displayName: mailbox.displayName
    }));
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

export function composeContextLabel(
  mode: ComposeMode,
  message: MessageDetail | null
): string | null {
  if (mode === "new" || !message) return null;
  const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
  const action = mode === "reply" ? "Replying to" : "Forwarding message from";
  const sender = message.fromName
    ? `${message.fromName} <${message.fromAddress}>`
    : message.fromAddress;
  return `${action} ${sender} · ${formatDateTime(timestamp)}`;
}

export function draftStatus(state: DraftSaveState): string {
  return state === "saving"
    ? "Saving draft…"
    : state === "local"
      ? "Saved on this device"
      : state === "error"
        ? "Draft not saved"
        : "Draft saved";
}

export function forwardedMessage(message: MessageDetail): { html: string; text: string } {
  const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;
  const lines = [
    "---------- Forwarded message ---------",
    `From: ${message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress}`,
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

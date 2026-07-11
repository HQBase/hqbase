import type { Mailbox } from "@/features/mailboxes/types";
import type { MessageDetail } from "@/features/messages/types";
import type { SendingIdentity } from "./compose-fields";

export type ComposeDialogProps = {
  mailboxes: Mailbox[];
  open: boolean;
  replyTo: MessageDetail | null;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
};

export const splitRecipients = (value: string) =>
  value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

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
) => JSON.stringify({ from, to, cc, bcc, subject, text, html });

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

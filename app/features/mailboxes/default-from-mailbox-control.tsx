import * as React from "react";
import { toast } from "sonner";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { updateDefaultFromMailbox } from "@/features/auth/api";
import type { Mailbox } from "./types";

export function DefaultFromMailboxControl({
  defaultFromMailboxId,
  mailboxes,
  onChanged
}: {
  defaultFromMailboxId: string | null;
  mailboxes: Mailbox[];
  onChanged: (mailboxId: string) => void;
}): React.ReactElement | null {
  const [pendingMailboxId, setPendingMailboxId] = React.useState<string | null>(null);
  const options = defaultFromMailboxOptions(mailboxes);
  const selectedMailboxId = options.some((mailbox) => mailbox.id === defaultFromMailboxId)
    ? (defaultFromMailboxId ?? "")
    : (options[0]?.id ?? "");

  if (options.length === 0) return null;

  async function changeDefault(mailboxId: string) {
    if (mailboxId === selectedMailboxId) return;
    setPendingMailboxId(mailboxId);
    try {
      await updateDefaultFromMailbox(mailboxId);
      onChanged(mailboxId);
      toast.success("Default From mailbox updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The default mailbox could not be saved."
      );
    } finally {
      setPendingMailboxId(null);
    }
  }

  return (
    <Field className="max-w-md">
      <FieldLabel htmlFor="default-from-mailbox">Default From mailbox</FieldLabel>
      <Select
        disabled={pendingMailboxId !== null}
        value={pendingMailboxId ?? selectedMailboxId}
        onValueChange={(mailboxId) => void changeDefault(mailboxId)}
      >
        <SelectTrigger id="default-from-mailbox" className="w-full shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((mailbox) => (
              <SelectItem key={mailbox.id} value={mailbox.id}>
                {mailbox.displayName} — {mailbox.address}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>
        New messages and forwards use this mailbox. Replies use the mailbox that received the
        original message.
      </FieldDescription>
    </Field>
  );
}

function defaultFromMailboxOptions(mailboxes: Mailbox[]): Mailbox[] {
  return mailboxes.filter(
    (mailbox) =>
      mailbox.isActive &&
      (mailbox.accessLevel === "agent" || mailbox.accessLevel === "manager") &&
      (mailbox.addresses.length === 0 ||
        mailbox.addresses.some((address) => address.isPrimary && address.sendEnabled))
  );
}

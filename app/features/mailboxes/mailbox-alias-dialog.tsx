import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Mailbox } from "./types";

export function MailboxAliasDialog({
  mailbox,
  address,
  pending,
  onAddressChange,
  onClose,
  onSubmit
}: {
  mailbox: Mailbox | null;
  address: string;
  pending: boolean;
  onAddressChange: (address: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): React.ReactElement {
  return (
    <Dialog
      open={mailbox !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[min(92vw,480px)]">
        <DialogHeader>
          <DialogTitle>Add email address</DialogTitle>
          <DialogDescription>
            Mail sent to this address will arrive in {mailbox?.address}. It can also be used when
            sending.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-mailbox-alias">Additional email address</FieldLabel>
              <Input
                id="new-mailbox-alias"
                placeholder="hello@example.com"
                required
                type="email"
                value={address}
                onChange={(event) => onAddressChange(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending ? "Adding address…" : "Add email address"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

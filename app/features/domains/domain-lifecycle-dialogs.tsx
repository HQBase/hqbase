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
import type { MailDomain } from "./types";

export function DisconnectDomainDialog({
  domain,
  onConfirm,
  onOpenChange
}: {
  domain: MailDomain | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <Dialog open={domain !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,520px)]">
        <DialogHeader>
          <DialogTitle>Disconnect domain?</DialogTitle>
          <DialogDescription>
            HQBase will stop new receiving and sending for {domain?.name}, reject delayed mail, and
            reset unknown-address mail to rejection. Existing mail stays available. Shared
            Cloudflare mail services, DNS, and the workspace portal stay in place.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Authorize and disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ForgetDomainDialog({
  confirmation,
  domain,
  pending,
  onConfirm,
  onConfirmationChange,
  onOpenChange
}: {
  confirmation: string;
  domain: MailDomain | null;
  pending: boolean;
  onConfirm: () => void;
  onConfirmationChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <Dialog open={domain !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,520px)]">
        <DialogHeader>
          <DialogTitle>Forget domain?</DialogTitle>
          <DialogDescription>
            This removes the local record for {domain?.name}. It is allowed only when the
            disconnected domain has no mailbox, agent, signature, or stored mail. Audit events stay
            available.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="forget-domain-confirmation">
              Enter {domain?.name} to confirm
            </FieldLabel>
            <Input
              autoComplete="off"
              id="forget-domain-confirmation"
              value={confirmation}
              onChange={(event) => onConfirmationChange(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={pending || confirmation.trim().toLowerCase() !== domain?.name}
            type="button"
            variant="destructive"
            onClick={onConfirm}
          >
            {pending ? "Forgetting…" : "Forget domain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

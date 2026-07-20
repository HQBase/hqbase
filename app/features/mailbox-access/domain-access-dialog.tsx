import * as React from "react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { Mailbox } from "@/features/mailboxes/types";
import type { WorkspaceUser } from "@/features/users/types";
import type { MailboxAccessPolicies } from "./mailbox-access-policies";
import type { MailboxAccessLevel } from "./types";

export function DomainAccessDialog({
  open,
  mailboxes,
  policies,
  users,
  onOpenChange
}: {
  open: boolean;
  mailboxes: Mailbox[];
  policies: MailboxAccessPolicies;
  users: WorkspaceUser[];
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [userId, setUserId] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [accessLevel, setAccessLevel] = React.useState<MailboxAccessLevel>("read");
  const managedUsers = users.filter((user) => user.role !== "owner");
  const domains = getDomains(mailboxes);

  function close(nextOpen: boolean) {
    if (!nextOpen) {
      setUserId("");
      setDomain("");
      setAccessLevel("read");
    }
    onOpenChange(nextOpen);
  }

  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const applied = await policies.applyDomain({ mailboxes, userId, domain, accessLevel });
    if (applied) close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="w-[min(92vw,500px)]">
        <DialogHeader>
          <DialogTitle>Set access by domain</DialogTitle>
          <DialogDescription>
            Give one user the same access level to every current mailbox on a domain.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={(event) => void apply(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel>User</FieldLabel>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger aria-label="User">
                  <SelectValue placeholder="Choose a user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {managedUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Domain</FieldLabel>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger aria-label="Domain">
                  <SelectValue placeholder="Choose a domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {domains.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Access level</FieldLabel>
              <Select
                value={accessLevel}
                onValueChange={(value) => setAccessLevel(value as MailboxAccessLevel)}
              >
                <SelectTrigger aria-label="Access level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Future mailboxes are not changed; only mailboxes that exist now are updated.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={policies.busy === "bulk" || !userId || !domain} type="submit">
              {policies.busy === "bulk" ? "Setting access…" : "Set access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getDomains(mailboxes: Mailbox[]): string[] {
  return Array.from(
    new Set(
      mailboxes.flatMap((mailbox) =>
        (mailbox.addresses.length ? mailbox.addresses : [{ address: mailbox.address }]).map(
          (identity) => identity.address.split("@")[1] ?? ""
        )
      )
    )
  )
    .filter(Boolean)
    .sort();
}

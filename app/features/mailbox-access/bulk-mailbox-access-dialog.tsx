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
import type { AccessChoice, MailboxAccessPolicies } from "./mailbox-access-policies";

export function BulkMailboxAccessDialog({
  open,
  mailboxes,
  policies,
  users,
  onApplied,
  onOpenChange
}: {
  open: boolean;
  mailboxes: Mailbox[];
  policies: MailboxAccessPolicies;
  users: WorkspaceUser[];
  onApplied: () => void;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [userId, setUserId] = React.useState("");
  const [accessLevel, setAccessLevel] = React.useState<AccessChoice>("read");
  const managedUsers = users.filter((user) => user.role !== "owner");

  function close(nextOpen: boolean) {
    if (!nextOpen) {
      setUserId("");
      setAccessLevel("read");
    }
    onOpenChange(nextOpen);
  }

  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const applied = await policies.applyMany({
      mailboxIds: mailboxes.map((mailbox) => mailbox.id),
      userId,
      accessLevel
    });
    if (!applied) return;
    close(false);
    onApplied();
  }

  const count = mailboxes.length;
  const noun = count === 1 ? "mailbox" : "mailboxes";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="w-[min(92vw,500px)]">
        <DialogHeader>
          <DialogTitle>Manage access for selected</DialogTitle>
          <DialogDescription>
            Update one user's access to {count} selected {noun}.
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
              <FieldLabel>Access</FieldLabel>
              <Select
                value={accessLevel}
                onValueChange={(value) => setAccessLevel(value as AccessChoice)}
              >
                <SelectTrigger aria-label="Access">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">No access</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Selected: {mailboxes.map((mailbox) => mailbox.address).join(", ")}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={policies.busy === "bulk" || !userId || count === 0} type="submit">
              {policies.busy === "bulk" ? "Updating access…" : `Update ${count} ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

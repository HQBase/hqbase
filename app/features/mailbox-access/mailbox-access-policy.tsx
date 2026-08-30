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
import { DropdownSelect } from "@/components/ui/dropdown-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { Mailbox } from "@/features/mailboxes/types";
import type { WorkspaceUser } from "@/features/users/types";
import {
  type AccessChoice,
  formatMailboxAccessSummary,
  type MailboxAccessPolicies
} from "./mailbox-access-policies";

export function MailboxAccessCell({
  mailbox,
  policies,
  users,
  onManage
}: {
  mailbox: Mailbox;
  policies: MailboxAccessPolicies;
  users: WorkspaceUser[];
  onManage: () => void;
}): React.ReactElement {
  return (
    <Button
      aria-label={`View access for ${mailbox.address}`}
      className="h-[30px] min-h-[30px] max-w-full justify-start whitespace-nowrap px-0 py-0.5 text-left text-xs font-normal text-muted-foreground [@media(hover:hover)]:hover:bg-transparent [@media(hover:hover)]:hover:text-foreground"
      type="button"
      variant="ghost"
      onClick={onManage}
    >
      <span className="truncate">
        {formatMailboxAccessSummary(mailbox.id, policies.grants, users, policies.loading)}
      </span>
    </Button>
  );
}

export function MailboxAccessPolicyDialog({
  mailbox,
  policies,
  users,
  onOpenChange
}: {
  mailbox: Mailbox | null;
  policies: MailboxAccessPolicies;
  users: WorkspaceUser[];
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const managedUsers = users.filter((user) => user.role !== "owner");

  return (
    <Dialog open={mailbox !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,640px)]">
        <DialogHeader>
          <DialogTitle>Manage access</DialogTitle>
          <DialogDescription>
            Choose who can use {mailbox?.address}. Owners always have manager access.
          </DialogDescription>
        </DialogHeader>
        <Table containerClassName="rounded-lg border">
          <TableHeader className="bg-muted/40">
            <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
              <TableHead>User</TableHead>
              <TableHead className="w-40">Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {managedUsers.length === 0 ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={2}>
                  No users are available for explicit access.
                </TableCell>
              </TableRow>
            ) : null}
            {managedUsers.map((user) => {
              const key = `${mailbox?.id ?? ""}:${user.id}`;
              const value =
                policies.grants.find(
                  (grant) => grant.mailboxId === mailbox?.id && grant.userId === user.id
                )?.accessLevel ?? "none";
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <span className="block">{user.name}</span>
                    <span className="block text-xs text-muted-foreground">{user.email}</span>
                  </TableCell>
                  <TableCell>
                    <DropdownSelect
                      ariaLabel={`${user.name} access to ${mailbox?.address ?? "mailbox"}`}
                      className="h-[30px] min-h-[30px] w-32 px-2.5 text-[13px] shadow-none"
                      disabled={policies.busy === key || !mailbox}
                      options={[
                        { label: "No access", value: "none" },
                        { label: "Read", value: "read" },
                        { label: "Handle mail", value: "agent" },
                        { label: "Manager", value: "manager" }
                      ]}
                      value={value}
                      onValueChange={(next) =>
                        mailbox
                          ? void policies.change(mailbox.id, user.id, next as AccessChoice)
                          : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

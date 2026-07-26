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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
      className="h-auto min-h-10 max-w-full justify-start whitespace-normal px-0 py-1 text-left text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
      type="button"
      variant="ghost"
      onClick={onManage}
    >
      <span className="line-clamp-2">
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
            <TableRow className="hover:bg-transparent">
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
                    <Select
                      disabled={policies.busy === key || !mailbox}
                      value={value}
                      onValueChange={(next) =>
                        mailbox
                          ? void policies.change(mailbox.id, user.id, next as AccessChoice)
                          : undefined
                      }
                    >
                      <SelectTrigger
                        aria-label={`${user.name} access to ${mailbox?.address ?? "mailbox"}`}
                        className="w-32 shadow-none"
                      >
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

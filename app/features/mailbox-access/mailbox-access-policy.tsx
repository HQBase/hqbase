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
import type { MailboxAccessLevel } from "./types";

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
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        {formatMailboxAccessSummary(mailbox.id, policies.grants, users, policies.loading)}
      </span>
      <Button
        aria-label={`Manage access for ${mailbox.address}`}
        size="sm"
        type="button"
        variant="ghost"
        onClick={onManage}
      >
        Manage
      </Button>
    </div>
  );
}

export function MailboxAccessPolicyDialog({
  mailbox,
  mailboxes,
  policies,
  users,
  onOpenChange
}: {
  mailbox: Mailbox | null;
  mailboxes: Mailbox[];
  policies: MailboxAccessPolicies;
  users: WorkspaceUser[];
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [view, setView] = React.useState<"mailbox" | "domain">("mailbox");
  const [bulkUserId, setBulkUserId] = React.useState("");
  const [bulkDomain, setBulkDomain] = React.useState("");
  const [bulkLevel, setBulkLevel] = React.useState<MailboxAccessLevel>("read");
  const managedUsers = users.filter((user) => user.role !== "owner");
  const domains = getDomains(mailboxes);

  function close(open: boolean) {
    if (!open) {
      setView("mailbox");
      setBulkUserId("");
      setBulkDomain("");
      setBulkLevel("read");
    }
    onOpenChange(open);
  }

  function showDomainAccess() {
    setBulkDomain(mailbox?.address.split("@")[1] ?? domains[0] ?? "");
    setView("domain");
  }

  async function applyDomainAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const applied = await policies.applyDomain({
      mailboxes,
      userId: bulkUserId,
      domain: bulkDomain,
      accessLevel: bulkLevel
    });
    if (applied) close(false);
  }

  return (
    <Dialog open={mailbox !== null} onOpenChange={close}>
      <DialogContent className="w-[min(94vw,640px)]">
        {view === "mailbox" ? (
          <>
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
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={showDomainAccess}>
                Apply to domain…
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Apply domain access</DialogTitle>
              <DialogDescription>
                Add explicit access to every current mailbox on one domain.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => void applyDomainAccess(event)}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel>User</FieldLabel>
                  <Select value={bulkUserId} onValueChange={setBulkUserId}>
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
                  <Select value={bulkDomain} onValueChange={setBulkDomain}>
                    <SelectTrigger aria-label="Domain">
                      <SelectValue placeholder="Choose a domain" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {domains.map((domain) => (
                          <SelectItem key={domain} value={domain}>
                            {domain}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Access level</FieldLabel>
                  <Select
                    value={bulkLevel}
                    onValueChange={(value) => setBulkLevel(value as MailboxAccessLevel)}
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
                    This applies to current mailboxes only. New mailboxes remain unchanged.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <DialogFooter className="sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => setView("mailbox")}>
                  Back
                </Button>
                <Button
                  disabled={policies.busy === "bulk" || !bulkUserId || !bulkDomain}
                  type="submit"
                >
                  {policies.busy === "bulk" ? "Applying access…" : "Apply access"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
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

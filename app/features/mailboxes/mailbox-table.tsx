import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { MailboxAccessPolicies } from "@/features/mailbox-access/mailbox-access-policies";
import { MailboxAccessCell } from "@/features/mailbox-access/mailbox-access-policy";
import type { WorkspaceUser } from "@/features/users/types";
import type { Mailbox } from "./types";

export function MailboxTable({
  canManage,
  mailboxes,
  policies,
  selectedIds,
  users,
  onAddAlias,
  onManageAccess,
  onRemoveAlias,
  onSelectionChange,
  onToggle
}: {
  canManage: boolean;
  mailboxes: Mailbox[];
  policies: MailboxAccessPolicies;
  selectedIds: string[];
  users: WorkspaceUser[];
  onAddAlias: (mailbox: Mailbox) => void;
  onManageAccess: (mailbox: Mailbox) => void;
  onRemoveAlias: (mailbox: Mailbox, addressId: string) => void;
  onSelectionChange: (selectedIds: string[]) => void;
  onToggle: (mailbox: Mailbox) => void;
}): React.ReactElement {
  const selected = new Set(selectedIds);
  const visibleIds = mailboxes.map((mailbox) => mailbox.id);
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  function selectVisible(checked: boolean) {
    const next = new Set(selected);
    for (const id of visibleIds) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onSelectionChange(Array.from(next));
  }

  function selectMailbox(mailboxId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(mailboxId);
    else next.delete(mailboxId);
    onSelectionChange(Array.from(next));
  }

  return (
    <Table containerClassName="rounded-lg border">
      <TableHeader className="bg-muted/40">
        <TableRow className="hover:bg-transparent">
          {canManage ? (
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all visible mailboxes"
                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => selectVisible(checked === true)}
              />
            </TableHead>
          ) : null}
          <TableHead>Address</TableHead>
          <TableHead className="hidden sm:table-cell">Name</TableHead>
          <TableHead className="w-28">Status</TableHead>
          {canManage ? <TableHead className="w-56">Access</TableHead> : null}
          {canManage ? (
            <TableHead className="w-px text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {mailboxes.length === 0 ? (
          <TableRow>
            <TableCell
              className="h-24 text-center text-muted-foreground"
              colSpan={canManage ? 6 : 3}
            >
              No mailboxes yet.
            </TableCell>
          </TableRow>
        ) : null}
        {mailboxes.map((mailbox) => {
          const isSelected = selected.has(mailbox.id);
          return (
            <TableRow data-state={isSelected ? "selected" : undefined} key={mailbox.id}>
              {canManage ? (
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${mailbox.address}`}
                    checked={isSelected}
                    onCheckedChange={(checked) => selectMailbox(mailbox.id, checked === true)}
                  />
                </TableCell>
              ) : null}
              <TableCell className="max-w-52">
                <span className="block truncate">{mailbox.address}</span>
                {mailbox.addresses
                  .filter((item) => !item.isPrimary)
                  .map((item) => (
                    <span
                      className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"
                      key={item.id}
                    >
                      {item.address}
                      {canManage ? (
                        <Button
                          className="h-5 px-1"
                          type="button"
                          variant="ghost"
                          onClick={() => onRemoveAlias(mailbox, item.id)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </span>
                  ))}
              </TableCell>
              <TableCell className="hidden sm:table-cell">{mailbox.displayName}</TableCell>
              <TableCell>
                <Badge variant={mailbox.isActive ? "secondary" : "outline"}>
                  {mailbox.isActive ? "Active" : "Disabled"}
                </Badge>
              </TableCell>
              {canManage ? (
                <TableCell>
                  <MailboxAccessCell
                    mailbox={mailbox}
                    policies={policies}
                    users={users}
                    onManage={() => onManageAccess(mailbox)}
                  />
                </TableCell>
              ) : null}
              {canManage ? (
                <TableCell className="whitespace-nowrap pl-1 text-right">
                  <Button
                    className="mr-2 px-2"
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => onAddAlias(mailbox)}
                  >
                    Add alias
                  </Button>
                  <Button
                    className="px-2"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => onToggle(mailbox)}
                  >
                    {mailbox.isActive ? "Disable" : "Enable"}
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

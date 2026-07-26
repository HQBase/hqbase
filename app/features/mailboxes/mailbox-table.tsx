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

export function MailboxSelectionBar({
  selectedCount,
  onManage
}: {
  selectedCount: number;
  onManage: () => void;
}): React.ReactElement | null {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/35 px-3 py-2">
      <span className="text-sm text-muted-foreground">{selectedCount} selected</span>
      <Button size="sm" type="button" onClick={onManage}>
        Manage access for selected
      </Button>
    </div>
  );
}

export function MailboxTable({
  canManage,
  mailboxes,
  policies,
  selectedIds,
  users,
  onOpenDetails,
  onSelectionChange
}: {
  canManage: boolean;
  mailboxes: Mailbox[];
  policies: MailboxAccessPolicies;
  selectedIds: string[];
  users: WorkspaceUser[];
  onOpenDetails: (mailbox: Mailbox) => void;
  onSelectionChange: (selectedIds: string[]) => void;
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
          <TableHead className="hidden w-28 md:table-cell">Status</TableHead>
          <TableHead className="w-32 sm:w-48">Access</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {mailboxes.length === 0 ? (
          <TableRow>
            <TableCell
              className="h-24 text-center text-muted-foreground"
              colSpan={canManage ? 5 : 4}
            >
              No mailboxes yet.
            </TableCell>
          </TableRow>
        ) : null}
        {mailboxes.map((mailbox) => {
          const isSelected = selected.has(mailbox.id);
          return (
            <TableRow
              className="cursor-pointer"
              data-state={isSelected ? "selected" : undefined}
              key={mailbox.id}
              onClick={() => onOpenDetails(mailbox)}
            >
              {canManage ? (
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    aria-label={`Select ${mailbox.address}`}
                    checked={isSelected}
                    onCheckedChange={(checked) => selectMailbox(mailbox.id, checked === true)}
                  />
                </TableCell>
              ) : null}
              <TableCell className="max-w-52">
                <button
                  className="block max-w-full truncate rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                  onClick={() => onOpenDetails(mailbox)}
                >
                  {mailbox.address}
                </button>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:hidden">
                  {mailbox.displayName}
                </span>
                <Badge
                  className="mt-1 md:hidden"
                  variant={mailbox.isActive ? "secondary" : "outline"}
                >
                  {mailbox.isActive ? "Active" : "Disabled"}
                </Badge>
              </TableCell>
              <TableCell className="hidden sm:table-cell">{mailbox.displayName}</TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant={mailbox.isActive ? "secondary" : "outline"}>
                  {mailbox.isActive ? "Active" : "Disabled"}
                </Badge>
              </TableCell>
              <TableCell>
                {canManage ? (
                  <MailboxAccessCell
                    mailbox={mailbox}
                    policies={policies}
                    users={users}
                    onManage={() => onOpenDetails(mailbox)}
                  />
                ) : (
                  <button
                    className="min-h-10 rounded-sm text-left text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    type="button"
                    onClick={() => onOpenDetails(mailbox)}
                  >
                    Your access ·{" "}
                    {mailbox.accessLevel
                      ? `${mailbox.accessLevel.slice(0, 1).toUpperCase()}${mailbox.accessLevel.slice(1)}`
                      : "None"}
                  </button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

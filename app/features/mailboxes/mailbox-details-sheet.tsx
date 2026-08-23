import type * as React from "react";
import { PiUsers } from "react-icons/pi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  formatAccessLevel,
  getMailboxAccessEntries,
  type MailboxAccessPolicies
} from "@/features/mailbox-access/mailbox-access-policies";
import type { WorkspaceUser } from "@/features/users/types";
import type { Mailbox } from "./types";

export function MailboxDetailsSheet({
  canManage,
  mailbox,
  policies,
  users,
  onManageAccess,
  onOpenChange
}: {
  canManage: boolean;
  mailbox: Mailbox | null;
  policies: MailboxAccessPolicies;
  users: WorkspaceUser[];
  onManageAccess: (mailbox: Mailbox) => void;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const people = mailbox ? getMailboxAccessEntries(mailbox.id, policies.grants, users) : [];

  return (
    <Sheet open={mailbox !== null} onOpenChange={onOpenChange}>
      <SheetContent
        aria-label={mailbox ? `Mailbox details for ${mailbox.address}` : "Mailbox details"}
        className="w-full max-w-none overflow-y-auto p-0 sm:w-[min(92vw,520px)]"
      >
        <header className="border-b px-5 py-5 pr-14 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mailbox details
          </p>
          <SheetTitle className="mt-1 truncate text-lg font-semibold">
            {mailbox?.address ?? "Mailbox"}
          </SheetTitle>
          <SheetDescription className="mt-1 text-sm text-muted-foreground">
            {mailbox?.displayName ?? "Shared workspace mailbox"}
          </SheetDescription>
        </header>

        <div className="space-y-7 px-5 py-6 sm:px-6">
          <section aria-labelledby="mailbox-access-heading">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium" id="mailbox-access-heading">
                  People with access
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Owners always have Manager access. Everyone else needs an explicit grant.
                </p>
              </div>
              {canManage && mailbox ? (
                <Button
                  className="shrink-0"
                  size="sm"
                  type="button"
                  onClick={() => onManageAccess(mailbox)}
                >
                  <PiUsers data-icon="inline-start" />
                  Manage access
                </Button>
              ) : null}
            </div>

            <div className="mt-4 divide-y rounded-md border">
              {people.map((person) => (
                <div className="flex items-center justify-between gap-3 px-3 py-3" key={person.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{person.name}</p>
                    {person.email ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {person.email}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">Every workspace owner</p>
                    )}
                  </div>
                  <Badge variant="secondary">{formatAccessLevel(person.accessLevel)}</Badge>
                </div>
              ))}
              {!canManage && mailbox?.accessLevel ? (
                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <p className="text-sm font-medium">Your access</p>
                  <Badge variant="secondary">{formatAccessLevel(mailbox.accessLevel)}</Badge>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

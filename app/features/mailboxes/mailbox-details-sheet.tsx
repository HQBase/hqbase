import { ChevronDown, Plus, Users } from "lucide-react";
import type * as React from "react";
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
  onAddAddress,
  onManageAccess,
  onOpenChange,
  onRemoveAddress,
  onToggle
}: {
  canManage: boolean;
  mailbox: Mailbox | null;
  policies: MailboxAccessPolicies;
  users: WorkspaceUser[];
  onAddAddress: (mailbox: Mailbox) => void;
  onManageAccess: (mailbox: Mailbox) => void;
  onOpenChange: (open: boolean) => void;
  onRemoveAddress: (mailbox: Mailbox, addressId: string) => void;
  onToggle: (mailbox: Mailbox) => void;
}): React.ReactElement {
  const people = mailbox ? getMailboxAccessEntries(mailbox.id, policies.grants, users) : [];
  const additionalAddresses = mailbox?.addresses.filter((address) => !address.isPrimary) ?? [];

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
                  <Users data-icon="inline-start" />
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

          <details className="group border-t pt-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              More settings
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="mt-3 space-y-5 rounded-md bg-muted/35 p-4">
              <section aria-labelledby="additional-addresses-heading">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-medium" id="additional-addresses-heading">
                      Additional email addresses
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Mail sent to these addresses arrives in this mailbox. They can also be used
                      when sending.
                    </p>
                  </div>
                  {canManage && mailbox ? (
                    <Button
                      aria-label={`Add an email address to ${mailbox.address}`}
                      className="shrink-0"
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => onAddAddress(mailbox)}
                    >
                      <Plus data-icon="inline-start" />
                      Add
                    </Button>
                  ) : null}
                </div>
                {additionalAddresses.length ? (
                  <ul className="mt-3 divide-y rounded-md border bg-background">
                    {additionalAddresses.map((address) => (
                      <li
                        className="flex min-h-11 items-center justify-between gap-3 px-3 py-2"
                        key={address.id}
                      >
                        <span className="min-w-0 truncate text-sm">{address.address}</span>
                        {canManage && mailbox ? (
                          <Button
                            aria-label={`Remove ${address.address}`}
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => onRemoveAddress(mailbox, address.id)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No additional email addresses.
                  </p>
                )}
              </section>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Mailbox status</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {mailbox?.isActive
                        ? "This mailbox can receive and send mail."
                        : "This mailbox is currently disabled."}
                    </p>
                  </div>
                  {mailbox ? (
                    canManage ? (
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => onToggle(mailbox)}
                      >
                        {mailbox.isActive ? "Disable" : "Enable"}
                      </Button>
                    ) : (
                      <Badge variant={mailbox.isActive ? "secondary" : "outline"}>
                        {mailbox.isActive ? "Active" : "Disabled"}
                      </Badge>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          </details>
        </div>
      </SheetContent>
    </Sheet>
  );
}

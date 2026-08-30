import * as React from "react";
import { PiTrash, PiUsers } from "react-icons/pi";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  formatAccessLevel,
  getMailboxAccessEntries,
  type MailboxAccessPolicies
} from "@/features/mailbox-access/mailbox-access-policies";
import type { WorkspaceUser } from "@/features/users/types";
import { updateMailbox } from "./api";
import type { Mailbox } from "./types";

export function MailboxDetailsSheet({
  canManage,
  mailbox,
  policies,
  users,
  onChanged,
  onDelete,
  onManageAccess,
  onOpenChange
}: {
  canManage: boolean;
  mailbox: Mailbox | null;
  policies: MailboxAccessPolicies;
  users: WorkspaceUser[];
  onChanged: () => Promise<void>;
  onDelete: (mailbox: Mailbox) => void;
  onManageAccess: (mailbox: Mailbox) => void;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const people = mailbox ? getMailboxAccessEntries(mailbox.id, policies.grants, users) : [];
  const [senderName, setSenderName] = React.useState("");
  const [senderNamePending, setSenderNamePending] = React.useState(false);

  React.useEffect(() => {
    setSenderName(mailbox?.displayName ?? "");
    setSenderNamePending(false);
  }, [mailbox?.displayName]);

  async function saveSenderName(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!mailbox) return;
    const displayName = senderName.trim();
    if (!displayName || displayName === mailbox.displayName) return;
    setSenderNamePending(true);
    try {
      await updateMailbox(mailbox.id, { displayName });
      await onChanged();
      toast.success("Sender name updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sender name could not be updated.");
    } finally {
      setSenderNamePending(false);
    }
  }

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
          <SheetTitle className="mt-1 truncate text-base font-semibold">
            {mailbox?.address ?? "Mailbox"}
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            {mailbox?.displayName ?? "Shared workspace mailbox"}
          </SheetDescription>
        </header>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          {canManage && mailbox ? (
            <section aria-labelledby="mailbox-sender-heading">
              <h3 className="text-sm font-medium" id="mailbox-sender-heading">
                Sender name
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Recipients see {senderName.trim() || mailbox.displayName} &lt;{mailbox.address}&gt;.
              </p>
              <form className="mt-3 flex items-end gap-2" onSubmit={saveSenderName}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label className="text-xs" htmlFor="mailbox-sender-name">
                    Sender name
                  </Label>
                  <Input
                    className="text-[13px] max-sm:h-[38px]"
                    id="mailbox-sender-name"
                    maxLength={80}
                    required
                    size="sm"
                    value={senderName}
                    onChange={(event) => setSenderName(event.target.value)}
                  />
                </div>
                <Button
                  className="max-sm:h-[38px] max-sm:min-h-[38px]"
                  disabled={
                    senderNamePending ||
                    !senderName.trim() ||
                    senderName.trim() === mailbox.displayName
                  }
                  type="submit"
                >
                  {senderNamePending ? <Spinner aria-hidden="true" /> : null}
                  Save
                </Button>
              </form>
            </section>
          ) : null}

          <section aria-labelledby="mailbox-access-heading">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium" id="mailbox-access-heading">
                  People with access
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
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

            <div className="mt-3 divide-y rounded-md border">
              {people.map((person) => (
                <div className="flex items-center justify-between gap-3 px-3 py-2" key={person.id}>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{person.name}</p>
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
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <p className="text-[13px] font-medium">Your access</p>
                  <Badge variant="secondary">{formatAccessLevel(mailbox.accessLevel)}</Badge>
                </div>
              ) : null}
            </div>
          </section>

          {canManage && mailbox ? (
            <section className="border-t pt-5" aria-labelledby="delete-mailbox-heading">
              <h3 className="text-sm font-medium" id="delete-mailbox-heading">
                Delete mailbox
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Hide this mailbox and stop new mail without deleting its history.
              </p>
              <Button
                className="mt-4"
                size="sm"
                type="button"
                variant="destructive"
                onClick={() => onDelete(mailbox)}
              >
                <PiTrash data-icon="inline-start" />
                Delete mailbox
              </Button>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

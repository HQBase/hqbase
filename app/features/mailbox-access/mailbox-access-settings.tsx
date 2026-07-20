import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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
import { SettingsSection } from "@/features/settings/settings-section";
import type { WorkspaceUser } from "@/features/users/types";
import { listMailboxGrants, revokeMailboxGrant, setMailboxGrant } from "./api";
import type { MailboxAccessLevel, MailboxGrant } from "./types";

type Choice = MailboxAccessLevel | "none";

export function MailboxAccessSettings({
  mailboxes,
  users
}: {
  mailboxes: Mailbox[];
  users: WorkspaceUser[];
}): React.ReactElement {
  const [grants, setGrants] = React.useState<MailboxGrant[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkUserId, setBulkUserId] = React.useState("");
  const [bulkDomain, setBulkDomain] = React.useState("");
  const [bulkLevel, setBulkLevel] = React.useState<MailboxAccessLevel>("read");

  const reload = React.useCallback(async () => setGrants(await listMailboxGrants()), []);
  React.useEffect(() => {
    void reload().catch((error) =>
      toast.error(error instanceof Error ? error.message : "Could not load mailbox access.")
    );
  }, [reload]);

  async function change(mailboxId: string, userId: string, value: Choice) {
    const key = `${mailboxId}:${userId}`;
    setBusy(key);
    try {
      if (value === "none") await revokeMailboxGrant(mailboxId, userId);
      else await setMailboxGrant({ mailboxId, userId, accessLevel: value });
      await reload();
      toast.success("Mailbox access updated. Active mail-client sessions were revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update mailbox access.");
    } finally {
      setBusy(null);
    }
  }

  const managedUsers = users.filter((user) => user.role !== "owner");
  const domains = Array.from(
    new Set(
      mailboxes.flatMap((mailbox) =>
        (mailbox.addresses?.length ? mailbox.addresses : [{ address: mailbox.address }]).map(
          (identity) => identity.address.split("@")[1] ?? ""
        )
      )
    )
  )
    .filter(Boolean)
    .sort();

  async function applyDomainGrants(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targets = mailboxes.filter((mailbox) =>
      (mailbox.addresses?.length ? mailbox.addresses : [{ address: mailbox.address }]).some(
        (identity) => identity.address.endsWith(`@${bulkDomain}`)
      )
    );
    if (!bulkUserId || !bulkDomain || targets.length === 0) return;
    setBusy("bulk");
    try {
      await Promise.all(
        targets.map((mailbox) =>
          setMailboxGrant({ mailboxId: mailbox.id, userId: bulkUserId, accessLevel: bulkLevel })
        )
      );
      await reload();
      setBulkOpen(false);
      toast.success(`Explicit grants written for ${targets.length} mailboxes.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply domain access.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsSection
      action={
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <Plus data-icon="inline-start" />
              Apply domain access
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[min(92vw,500px)]">
            <DialogHeader>
              <DialogTitle>Apply domain access</DialogTitle>
              <DialogDescription>
                Add explicit access to every current mailbox on one domain.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => void applyDomainGrants(event)}
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
                    This does not grant access to mailboxes added later.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button disabled={busy === "bulk" || !bulkUserId || !bulkDomain} type="submit">
                  {busy === "bulk" ? "Applying access…" : "Apply access"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
      description="Read can view mail; Agent can also send; Manager can configure the mailbox"
      title="Mailbox access"
    >
      <Table containerClassName="rounded-lg border">
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead>User</TableHead>
            <TableHead>Mailbox</TableHead>
            <TableHead className="w-44">Access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {managedUsers.length === 0 || mailboxes.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={3}>
                No mailbox access rows yet.
              </TableCell>
            </TableRow>
          ) : null}
          {managedUsers.flatMap((user) =>
            mailboxes.map((mailbox) => {
              const key = `${mailbox.id}:${user.id}`;
              const value =
                grants.find((grant) => grant.mailboxId === mailbox.id && grant.userId === user.id)
                  ?.accessLevel ?? "none";
              return (
                <TableRow key={key}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{mailbox.address}</TableCell>
                  <TableCell>
                    <Select
                      disabled={busy === key}
                      value={value}
                      onValueChange={(next) => void change(mailbox.id, user.id, next as Choice)}
                    >
                      <SelectTrigger
                        aria-label={`${user.name} access to ${mailbox.address}`}
                        className="w-36 shadow-none"
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
            })
          )}
        </TableBody>
      </Table>
    </SettingsSection>
  );
}

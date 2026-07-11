import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
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
  async function applyDomainGrants() {
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
      toast.success(`Explicit grants written for ${targets.length} mailboxes.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply domain access.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-medium">Mailbox access</CardTitle>
        <CardDescription className="text-xs">
          Read can view mail. Agent can also send and change shared state. Manager can configure the
          mailbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2 rounded-md border bg-background/50 p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <Select value={bulkUserId} onValueChange={setBulkUserId}>
            <SelectTrigger>
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              {managedUsers.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bulkDomain} onValueChange={setBulkDomain}>
            <SelectTrigger>
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent>
              {domains.map((domain) => (
                <SelectItem key={domain} value={domain}>
                  {domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={bulkLevel}
            onValueChange={(value) => setBulkLevel(value as MailboxAccessLevel)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
            </SelectContent>
          </Select>
          <Button
            disabled={busy === "bulk" || !bulkUserId || !bulkDomain}
            type="button"
            onClick={() => void applyDomainGrants()}
          >
            Apply to domain
          </Button>
          <p className="text-xs text-muted-foreground md:col-span-4">
            This is a bulk action. It writes explicit mailbox grants and does not grant future
            mailboxes automatically.
          </p>
        </div>
        <Table className="overflow-hidden rounded-md border">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Mailbox</TableHead>
              <TableHead>Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
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
                        <SelectTrigger className="w-36 shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No access</SelectItem>
                          <SelectItem value="read">Read</SelectItem>
                          <SelectItem value="agent">Agent</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

import * as React from "react";
import { toast } from "sonner";

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
  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-medium">Mailbox access</CardTitle>
        <CardDescription className="text-xs">
          Read can view mail. Agent can also send and change shared state. Manager can configure the
          mailbox.
        </CardDescription>
      </CardHeader>
      <CardContent>
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

import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ProUpgradeCard } from "@/components/pro-upgrade";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { createMailbox, updateMailbox } from "./api";
import type { Mailbox } from "./types";

type MailboxSettingsProps = {
  canManage: boolean;
  mailboxes: Mailbox[];
  onChanged: () => void;
};

export function MailboxSettings({
  canManage,
  mailboxes,
  onChanged
}: MailboxSettingsProps): React.ReactElement {
  const [address, setAddress] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createMailbox({ address, displayName });
      setAddress("");
      setDisplayName("");
      toast.success("Mailbox created.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mailbox creation failed.");
    }
  }

  async function handleToggle(mailbox: Mailbox) {
    await updateMailbox(mailbox.id, { isActive: !mailbox.isActive });
    onChanged();
  }

  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">Mailboxes</CardTitle>
        <CardDescription className="text-xs">Shared addresses on your domain</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        {canManage ? (
          <ProUpgradeCard
            description="Add aliases and sending identities across multiple domains without creating another HQBase deployment."
            dismissible
            placement="settings-mailboxes"
            title="One mailbox can answer from more than one address in Pro."
          />
        ) : null}
        {canManage && (
          <form
            className="grid min-w-0 gap-3 rounded-md border bg-background/50 p-3 md:grid-cols-[1fr_0.8fr_auto]"
            onSubmit={(event) => void handleCreate(event)}
          >
            <Input
              className="shadow-none focus-visible:ring-1"
              placeholder="support@example.com"
              required
              type="email"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            <Input
              className="shadow-none focus-visible:ring-1"
              placeholder="Display name"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <Button type="submit">
              <Plus />
              Add
            </Button>
          </form>
        )}
        <Table className="overflow-hidden rounded-md border">
          <TableHeader>
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead className="hidden sm:table-cell">Name</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {mailboxes.map((mailbox) => (
              <TableRow className="hover:bg-muted/35" key={mailbox.id}>
                <TableCell className="max-w-36 truncate">{mailbox.address}</TableCell>
                <TableCell className="hidden sm:table-cell">{mailbox.displayName}</TableCell>
                <TableCell>
                  <Badge variant={mailbox.isActive ? "secondary" : "outline"}>
                    {mailbox.isActive ? "Active" : "Disabled"}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="pl-1 text-right">
                    <Button
                      className="px-2"
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => void handleToggle(mailbox)}
                    >
                      {mailbox.isActive ? "Disable" : "Enable"}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

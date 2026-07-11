import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
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
import { addMailboxAddress, createMailbox, removeMailboxAddress, updateMailbox } from "./api";
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
  async function handleAlias(mailbox: Mailbox) {
    const address = window.prompt("Alias address");
    if (!address) return;
    try {
      await addMailboxAddress(mailbox.id, { address, displayName: mailbox.displayName });
      toast.success("Alias added.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Alias creation failed.");
    }
  }
  async function handleRemoveAlias(mailbox: Mailbox, addressId: string) {
    await removeMailboxAddress(mailbox.id, addressId);
    onChanged();
  }

  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">Mailboxes</CardTitle>
        <CardDescription className="text-xs">Shared addresses on your domain</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
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
                <TableCell className="max-w-52">
                  <span className="block truncate">{mailbox.address}</span>
                  {mailbox.addresses
                    ?.filter((item) => !item.isPrimary)
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
                            onClick={() => void handleRemoveAlias(mailbox, item.id)}
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
                {canManage && (
                  <TableCell className="pl-1 text-right">
                    <Button
                      className="mr-2 px-2"
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => void handleAlias(mailbox)}
                    >
                      Add alias
                    </Button>
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

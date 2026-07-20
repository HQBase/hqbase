import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { SettingsSection } from "@/features/settings/settings-section";
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
  const [createOpen, setCreateOpen] = React.useState(false);
  const [aliasMailbox, setAliasMailbox] = React.useState<Mailbox | null>(null);
  const [aliasAddress, setAliasAddress] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<"mailbox" | "alias" | null>(null);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("mailbox");
    try {
      await createMailbox({ address, displayName });
      setAddress("");
      setDisplayName("");
      setCreateOpen(false);
      toast.success("Mailbox created.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mailbox creation failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleToggle(mailbox: Mailbox) {
    await updateMailbox(mailbox.id, { isActive: !mailbox.isActive });
    onChanged();
  }

  async function handleAlias(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aliasMailbox) return;
    setPendingAction("alias");
    try {
      await addMailboxAddress(aliasMailbox.id, {
        address: aliasAddress,
        displayName: aliasMailbox.displayName
      });
      setAliasAddress("");
      setAliasMailbox(null);
      toast.success("Alias added.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Alias creation failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveAlias(mailbox: Mailbox, addressId: string) {
    await removeMailboxAddress(mailbox.id, addressId);
    onChanged();
  }

  return (
    <SettingsSection
      action={
        canManage ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button type="button">
                <Plus data-icon="inline-start" />
                Add mailbox
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[min(92vw,480px)]">
              <DialogHeader>
                <DialogTitle>Add mailbox</DialogTitle>
                <DialogDescription>Create a shared address for this workspace.</DialogDescription>
              </DialogHeader>
              <form className="flex flex-col gap-5" onSubmit={(event) => void handleCreate(event)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="new-mailbox-address">Email address</FieldLabel>
                    <Input
                      id="new-mailbox-address"
                      placeholder="support@example.com"
                      required
                      type="email"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-mailbox-name">Display name</FieldLabel>
                    <Input
                      id="new-mailbox-name"
                      placeholder="Support"
                      required
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button disabled={pendingAction !== null} type="submit">
                    {pendingAction === "mailbox" ? "Adding mailbox…" : "Add mailbox"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null
      }
      description="Shared addresses across your connected domains"
      title="Mailboxes"
    >
      <Table containerClassName="rounded-lg border">
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead>Address</TableHead>
            <TableHead className="hidden sm:table-cell">Name</TableHead>
            <TableHead className="w-28">Status</TableHead>
            {canManage && (
              <TableHead className="w-px text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {mailboxes.length === 0 ? (
            <TableRow>
              <TableCell
                className="h-24 text-center text-muted-foreground"
                colSpan={canManage ? 4 : 3}
              >
                No mailboxes yet.
              </TableCell>
            </TableRow>
          ) : null}
          {mailboxes.map((mailbox) => (
            <TableRow key={mailbox.id}>
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
                <TableCell className="whitespace-nowrap pl-1 text-right">
                  <Button
                    className="mr-2 px-2"
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setAliasMailbox(mailbox)}
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

      <Dialog
        open={aliasMailbox !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAliasMailbox(null);
            setAliasAddress("");
          }
        }}
      >
        <DialogContent className="w-[min(92vw,480px)]">
          <DialogHeader>
            <DialogTitle>Add alias</DialogTitle>
            <DialogDescription>
              Add another sending and receiving address to {aliasMailbox?.address}.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-5" onSubmit={(event) => void handleAlias(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-mailbox-alias">Alias address</FieldLabel>
                <Input
                  id="new-mailbox-alias"
                  placeholder="hello@example.com"
                  required
                  type="email"
                  value={aliasAddress}
                  onChange={(event) => setAliasAddress(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={pendingAction !== null} type="submit">
                {pendingAction === "alias" ? "Adding alias…" : "Add alias"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

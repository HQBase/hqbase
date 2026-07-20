import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { SettingsSection } from "@/features/settings/settings-section";
import { createAppPassword, listAppPasswords, revokeAppPassword } from "./api";
import type { AppPassword } from "./types";

export function AppPasswordSettings(): React.ReactElement {
  const [items, setItems] = React.useState<AppPassword[]>([]);
  const [name, setName] = React.useState("");
  const [createdPassword, setCreatedPassword] = React.useState<string | null>(null);
  const [expiry, setExpiry] = React.useState("90");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const refresh = React.useCallback(async () => setItems(await listAppPasswords()), []);
  React.useEffect(() => void refresh(), [refresh]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const created = await createAppPassword(
        name,
        expiry === "never" ? undefined : Number(expiry)
      );
      setCreatedPassword(created.password);
      setName("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create app password.");
    } finally {
      setPending(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeAppPassword(id);
      await refresh();
      toast.success("App password revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke app password.");
    }
  }

  function setDialogOpen(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setName("");
      setExpiry("90");
      setCreatedPassword(null);
    }
  }

  return (
    <SettingsSection
      action={
        <Dialog open={createOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <Plus data-icon="inline-start" />
              Create password
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[min(92vw,500px)]">
            <DialogHeader>
              <DialogTitle>
                {createdPassword ? "App password created" : "Create app password"}
              </DialogTitle>
              <DialogDescription>
                {createdPassword
                  ? "Copy this password before closing. It cannot be shown again."
                  : "Create a separate, revocable credential for an IMAP or SMTP client."}
              </DialogDescription>
            </DialogHeader>
            {createdPassword ? (
              <>
                <div className="flex items-center gap-2 rounded-md border bg-muted/45 p-3">
                  <code className="min-w-0 flex-1 break-all text-sm">{createdPassword}</code>
                  <Button
                    aria-label="Copy app password"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(createdPassword)
                        .then(() => toast.success("Copied."))
                    }
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <Copy />
                  </Button>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button">Done</Button>
                  </DialogClose>
                </DialogFooter>
              </>
            ) : (
              <form className="flex flex-col gap-5" onSubmit={(event) => void handleCreate(event)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="app-password-name">Password name</FieldLabel>
                    <Input
                      id="app-password-name"
                      maxLength={80}
                      placeholder="MacBook Mail"
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Password expiry</FieldLabel>
                    <Select value={expiry} onValueChange={setExpiry}>
                      <SelectTrigger aria-label="Password expiry">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="30">30 days</SelectItem>
                          <SelectItem value="90">90 days</SelectItem>
                          <SelectItem value="365">1 year</SelectItem>
                          <SelectItem value="never">No expiry</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button disabled={pending} type="submit">
                    {pending ? "Creating password…" : "Create password"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      }
      description="Separate, revocable credentials for IMAP and SMTP clients"
      title="Mail client passwords"
    >
      <Alert>
        <KeyRound />
        <AlertTitle>Private preview</AlertTitle>
        <AlertDescription>
          The basic Pro launch is web-first. These credentials work only after HQBase confirms that
          this workspace has a dedicated preview bridge; IMAP/SMTP is not generally available yet.
        </AlertDescription>
      </Alert>
      <Table className="overflow-hidden rounded-md border">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                {item.name}
                {item.revokedAt ? " (revoked)" : ""}
              </TableCell>
              <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : "Never"}
              </TableCell>
              <TableCell>
                {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "Never"}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  aria-label={`Revoke ${item.name}`}
                  disabled={Boolean(item.revokedAt)}
                  onClick={() => void handleRevoke(item.id)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsSection>
  );
}

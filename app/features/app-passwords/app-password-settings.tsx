import { Copy, KeyRound, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { createAppPassword, listAppPasswords, revokeAppPassword } from "./api";
import type { AppPassword } from "./types";

export function AppPasswordSettings(): React.ReactElement {
  const [items, setItems] = React.useState<AppPassword[]>([]);
  const [name, setName] = React.useState("");
  const [createdPassword, setCreatedPassword] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const refresh = React.useCallback(async () => setItems(await listAppPasswords()), []);
  React.useEffect(() => void refresh(), [refresh]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const created = await createAppPassword(name);
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

  return (
    <Card className="bg-card/70 shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-medium">Mail client passwords</CardTitle>
        <CardDescription>
          Separate, revocable credentials for IMAP and SMTP clients.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="flex gap-2" onSubmit={(event) => void handleCreate(event)}>
          <Input
            aria-label="Password name"
            maxLength={80}
            placeholder="MacBook Mail"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button disabled={pending} type="submit">
            <KeyRound />
            Create
          </Button>
        </form>
        {createdPassword ? (
          <Alert>
            <KeyRound />
            <AlertTitle>Copy this password now</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>It is shown once and cannot be recovered.</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1">
                  {createdPassword}
                </code>
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
            </AlertDescription>
          </Alert>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
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
      </CardContent>
    </Card>
  );
}

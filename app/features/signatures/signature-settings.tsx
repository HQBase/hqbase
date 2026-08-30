import * as React from "react";
import { PiDotsThree, PiPencilSimple, PiPlus, PiTrash } from "react-icons/pi";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { DropdownSelectOption } from "@/components/ui/dropdown-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { CurrentUser } from "@/features/auth/types";
import type { Mailbox } from "@/features/mailboxes/types";
import { SettingsSection } from "@/features/settings/settings-section";
import { deleteSignature, listManagedSignatures, signatureScopeValue } from "./api";
import { SignatureEditorDialog } from "./signature-editor-dialog";
import type { Signature, SignatureScopeTarget } from "./types";

type DomainOption = { id: string; name: string; isEnabled: boolean };

export function SignatureSettings({
  domains,
  mailboxes,
  user
}: {
  domains: DomainOption[];
  mailboxes: Mailbox[];
  user: Pick<CurrentUser, "id" | "role">;
}): React.ReactElement {
  const [signatures, setSignatures] = React.useState<Signature[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<Signature | "new" | null>(null);
  const [removing, setRemoving] = React.useState<Signature | null>(null);
  const [pending, setPending] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setSignatures(await listManagedSignatures());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Signatures could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function remove(): Promise<void> {
    if (!removing) return;
    setPending(true);
    try {
      await deleteSignature(removing.id);
      toast.success(`Signature “${removing.name}” deleted. Saved drafts keep their copy.`);
      setRemoving(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Signature could not be deleted.");
    } finally {
      setPending(false);
    }
  }

  const scopes = managedScopeOptions(user, mailboxes, domains);
  return (
    <>
      <SettingsSection
        action={
          <Button size="sm" type="button" onClick={() => setEditing("new")}>
            <PiPlus aria-hidden="true" />
            Add signature
          </Button>
        }
        description="Create personal signatures and shared signatures that you manage."
        title="Signatures"
      >
        <Table containerClassName="rounded-lg border">
          <TableHeader className="bg-muted/40">
            <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead className="w-44">Scope</TableHead>
              <TableHead className="w-24">Default</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={4}>
                  Loading signatures…
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && signatures.length === 0 ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={4}>
                  No signatures yet.
                </TableCell>
              </TableRow>
            ) : null}
            {!loading
              ? signatures.map((signature) => (
                  <TableRow key={signature.id}>
                    <TableCell className="min-w-56">
                      <span className="block truncate font-medium">{signature.name}</span>
                      <span className="mt-0.5 block max-w-md truncate whitespace-pre-line text-xs text-muted-foreground">
                        {signature.text}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{signature.scopeLabel}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {signature.isDefault ? <Badge variant="secondary">Default</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={`Actions for ${signature.name}`}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <PiDotsThree aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              className="gap-2"
                              onSelect={() => setEditing(signature)}
                            >
                              <PiPencilSimple aria-hidden="true" />
                              Edit signature
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              className="gap-2 text-destructive"
                              onSelect={() => setRemoving(signature)}
                            >
                              <PiTrash aria-hidden="true" />
                              Delete signature
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </SettingsSection>

      <SignatureEditorDialog
        editing={editing}
        scopes={scopes}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await refresh();
        }}
      />

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="w-[min(92vw,440px)]">
          <DialogHeader>
            <DialogTitle>Delete signature?</DialogTitle>
            <DialogDescription>
              Saved drafts keep their current copy. New drafts will use the next applicable default.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={pending}
              type="button"
              variant="ghost"
              onClick={() => setRemoving(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={pending}
              type="button"
              variant="destructive"
              onClick={() => void remove()}
            >
              {pending ? <Spinner aria-hidden="true" /> : null}
              Delete signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function managedScopeOptions(
  user: Pick<CurrentUser, "id" | "role">,
  mailboxes: Mailbox[],
  domains: DomainOption[]
): DropdownSelectOption[] {
  const personal: SignatureScopeTarget = { type: "user", id: user.id };
  const options: DropdownSelectOption[] = [
    { label: "Personal", value: signatureScopeValue(personal) }
  ];
  for (const mailbox of mailboxes) {
    if (mailbox.accessLevel !== "manager" || mailbox.deletedAt) continue;
    const target: SignatureScopeTarget = { type: "mailbox", id: mailbox.id };
    options.push({
      label: `Mailbox · ${mailbox.displayName || mailbox.address} · ${mailbox.address}`,
      value: signatureScopeValue(target)
    });
  }
  if (user.role === "owner" || user.role === "admin") {
    for (const domain of domains) {
      const target: SignatureScopeTarget = { type: "domain", id: domain.id };
      options.push({
        label: `Exact domain · ${domain.name}`,
        value: signatureScopeValue(target)
      });
    }
  }
  return options;
}

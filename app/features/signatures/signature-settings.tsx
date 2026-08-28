import * as React from "react";
import { PiPencilSimple, PiPlus, PiTrash } from "react-icons/pi";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { DropdownSelect, type DropdownSelectOption } from "@/components/ui/dropdown-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { signatureImagesFromFiles } from "@/features/compose/email-images";
import { RichEmailEditor } from "@/features/compose/rich-email-editor";
import type { Mailbox } from "@/features/mailboxes/types";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  createSignature,
  deleteSignature,
  listManagedSignatures,
  parseSignatureScope,
  signatureScopeValue,
  updateSignature
} from "./api";
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
              <TableHead className="w-24 text-right">Actions</TableHead>
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
                    <TableCell className="space-x-1 text-right">
                      <Button
                        aria-label={`Edit ${signature.name}`}
                        className="size-9"
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() => setEditing(signature)}
                      >
                        <PiPencilSimple aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={`Delete ${signature.name}`}
                        className="size-9 text-destructive"
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() => setRemoving(signature)}
                      >
                        <PiTrash aria-hidden="true" />
                      </Button>
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
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setRemoving(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={pending}
              size="sm"
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

function SignatureEditorDialog({
  editing,
  scopes,
  onOpenChange,
  onSaved
}: {
  editing: Signature | "new" | null;
  scopes: DropdownSelectOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}): React.ReactElement {
  const [name, setName] = React.useState("");
  const [html, setHtml] = React.useState("<p></p>");
  const [text, setText] = React.useState("");
  const [scope, setScope] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!editing) return;
    setName(editing === "new" ? "" : editing.name);
    setHtml(editing === "new" ? "<p></p>" : editing.html);
    setText(editing === "new" ? "" : editing.text);
    setScope(
      editing === "new"
        ? (scopes[0]?.value ?? "")
        : signatureScopeValue({ type: editing.scope, id: editing.scopeId })
    );
    setIsDefault(editing === "new" ? false : editing.isDefault);
  }, [editing, scopes]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editing || !name.trim() || !text.trim() || !scope) return;
    setPending(true);
    try {
      if (editing === "new") {
        await createSignature({
          name: name.trim(),
          html,
          scope: parseSignatureScope(scope),
          isDefault
        });
        toast.success("Signature created.");
      } else {
        await updateSignature(editing.id, { name: name.trim(), html, isDefault });
        toast.success("Signature updated.");
      }
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Signature could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92vh,760px)] w-[min(94vw,720px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Add signature" : "Edit signature"}</DialogTitle>
          <DialogDescription>
            Use simple formatting and up to five images (256 KiB total). HQBase makes a safe
            plain-text version when you save.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="signature-name">Name</Label>
            <Input
              id="signature-name"
              maxLength={80}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signature-scope">Scope</Label>
            <DropdownSelect
              ariaLabel="Signature scope"
              disabled={editing !== "new"}
              id="signature-scope"
              options={scopes}
              required
              value={scope}
              onValueChange={setScope}
            />
            {editing !== "new" ? (
              <p className="text-xs text-muted-foreground">
                Create a new signature to use a different scope.
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>Content</Label>
            <div className="overflow-hidden rounded-lg border">
              <RichEmailEditor
                allowDataImages
                contained={false}
                html={html}
                onFiles={() => {
                  toast.error("Use AVIF, GIF, JPEG, PNG, or WebP image files.");
                }}
                onImages={async (files, currentHtml) => {
                  try {
                    return await signatureImagesFromFiles(files, currentHtml);
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Image could not be added."
                    );
                    return [];
                  }
                }}
                onChange={(nextHtml, nextText) => {
                  setHtml(nextHtml);
                  setText(nextText);
                }}
              />
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              checked={isDefault}
              id="signature-default"
              onCheckedChange={(checked) => setIsDefault(checked === true)}
            />
            <Label className="pt-0.5 font-normal" htmlFor="signature-default">
              Use as the default for this scope
            </Label>
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={pending || !name.trim() || !text.trim() || !scope}
              size="sm"
              type="submit"
            >
              {pending ? <Spinner aria-hidden="true" /> : null}
              Save signature
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

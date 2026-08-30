import * as React from "react";
import { toast } from "sonner";

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
import { signatureImagesFromFiles } from "@/features/compose/email-images";
import { RichEmailEditor } from "@/features/compose/rich-email-editor";
import { createSignature, parseSignatureScope, signatureScopeValue, updateSignature } from "./api";
import type { Signature } from "./types";

export function SignatureEditorDialog({
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

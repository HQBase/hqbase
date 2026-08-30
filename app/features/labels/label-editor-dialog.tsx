import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createLabel, updateLabel } from "./api";
import { LabelColorDot } from "./label-colors";
import { type LabelColor, labelColors, type MailLabel } from "./types";

export function LabelEditorDialog({
  editing,
  onOpenChange,
  onSaved
}: {
  editing: MailLabel | "new" | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (label: MailLabel) => Promise<void>;
}): React.ReactElement {
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<LabelColor>("blue");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!editing) return;
    setName(editing === "new" ? "" : editing.name);
    setColor(editing === "new" ? "blue" : editing.color);
  }, [editing]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setPending(true);
    try {
      const label =
        editing === "new"
          ? await createLabel({ color, name: trimmedName })
          : editing
            ? await updateLabel(editing.id, { color, name: trimmedName })
            : null;
      if (!label) return;
      toast.success(editing === "new" ? "Label created." : "Label updated.");
      await onSaved(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Label could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,460px)]">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Create label" : "Edit label"}</DialogTitle>
          <DialogDescription>Choose a shared name and color.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="label-name">Name</FieldLabel>
              <Input
                id="label-name"
                maxLength={80}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="label-color">Color</FieldLabel>
              <DropdownSelect
                ariaLabel="Label color"
                id="label-color"
                options={labelColors.map((option) => ({
                  label: (
                    <span className="flex items-center gap-2">
                      <LabelColorDot color={option} />
                      <span className="capitalize">{option}</span>
                    </span>
                  ),
                  value: option
                }))}
                value={color}
                onValueChange={(value) => setColor(value as LabelColor)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button
              disabled={pending}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending || !name.trim()} size="sm" type="submit">
              {pending ? <Spinner aria-hidden="true" /> : null}
              {editing === "new" ? "Create label" : "Save label"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

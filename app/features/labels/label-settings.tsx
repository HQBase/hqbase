import * as React from "react";
import { PiPencilSimple, PiPlus, PiTrash } from "react-icons/pi";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { SettingsSection } from "@/features/settings/settings-section";
import { createLabel, deleteLabel, updateLabel } from "./api";
import { LabelColorDot } from "./label-colors";
import { type LabelColor, labelColors, type MailLabel } from "./types";

export function LabelSettings({
  canManage,
  labels,
  onChanged
}: {
  canManage: boolean;
  labels: MailLabel[];
  onChanged: () => Promise<void>;
}): React.ReactElement {
  const [editing, setEditing] = React.useState<MailLabel | "new" | null>(null);
  const [removing, setRemoving] = React.useState<MailLabel | null>(null);
  const [pending, setPending] = React.useState(false);

  async function remove(): Promise<void> {
    if (!removing) return;
    setPending(true);
    try {
      await deleteLabel(removing.id);
      toast.success(`Label “${removing.name}” deleted.`);
      setRemoving(null);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Label could not be deleted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SettingsSection
        action={
          canManage ? (
            <Button size="sm" type="button" onClick={() => setEditing("new")}>
              <PiPlus aria-hidden="true" />
              Add label
            </Button>
          ) : null
        }
        description="Shared organization for people and mail agents"
        title="Labels"
      >
        {labels.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No labels yet.
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-background">
            {labels.map((label) => (
              <div className="flex min-h-14 items-center gap-3 px-4 py-2.5" key={label.id}>
                <LabelColorDot className="size-3" color={label.color} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{label.name}</span>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label={`Edit ${label.name}`}
                      className="size-9"
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => setEditing(label)}
                    >
                      <PiPencilSimple aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={`Delete ${label.name}`}
                      className="size-9 text-destructive"
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => setRemoving(label)}
                    >
                      <PiTrash aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {!canManage ? (
          <p className="text-xs text-muted-foreground">
            Only an owner or admin can create, rename, recolor, or delete shared labels.
          </p>
        ) : null}
      </SettingsSection>
      <LabelEditorDialog
        editing={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await onChanged();
        }}
      />
      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="w-[min(92vw,440px)]">
          <DialogHeader>
            <DialogTitle>Delete label?</DialogTitle>
            <DialogDescription>
              {removing
                ? `“${removing.name}” will be removed from all mail. No email will be deleted or moved.`
                : "The label will be removed from all mail."}
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
              Delete label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LabelEditorDialog({
  editing,
  onOpenChange,
  onSaved
}: {
  editing: MailLabel | "new" | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
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
      if (editing === "new") await createLabel({ color, name: trimmedName });
      else if (editing) await updateLabel(editing.id, { color, name: trimmedName });
      toast.success(editing === "new" ? "Label created." : "Label updated.");
      await onSaved();
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
          <DialogTitle>{editing === "new" ? "Add label" : "Edit label"}</DialogTitle>
          <DialogDescription>Choose a shared name and color.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="label-name">Name</Label>
            <Input
              id="label-name"
              maxLength={80}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="label-color">Color</Label>
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
            <Button disabled={pending || !name.trim()} size="sm" type="submit">
              {pending ? <Spinner aria-hidden="true" /> : null}
              Save label
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

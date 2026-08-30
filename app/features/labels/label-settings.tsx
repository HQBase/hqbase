import * as React from "react";
import { PiDotsThree, PiPencilSimple, PiPlus, PiTrash } from "react-icons/pi";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { SettingsSection } from "@/features/settings/settings-section";
import { deleteLabel } from "./api";
import { LabelColorDot } from "./label-colors";
import { LabelEditorDialog } from "./label-editor-dialog";
import type { MailLabel } from "./types";

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
        <Table containerClassName="rounded-lg border">
          <TableHeader className="bg-muted/40">
            <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
              <TableHead>Label</TableHead>
              <TableHead className="w-40">Color</TableHead>
              {canManage ? <TableHead className="w-16 text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {labels.length === 0 ? (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={canManage ? 3 : 2}
                >
                  No labels yet.
                </TableCell>
              </TableRow>
            ) : null}
            {labels.map((label) => (
              <TableRow key={label.id}>
                <TableCell className="max-w-64 truncate font-medium">{label.name}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 capitalize">
                    <LabelColorDot className="size-3" color={label.color} />
                    {label.color}
                  </span>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`Actions for ${label.name}`}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <PiDotsThree aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem className="gap-2" onSelect={() => setEditing(label)}>
                            <PiPencilSimple aria-hidden="true" />
                            Edit label
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            className="gap-2 text-destructive"
                            onSelect={() => setRemoving(label)}
                          >
                            <PiTrash aria-hidden="true" />
                            Delete label
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
              Delete label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

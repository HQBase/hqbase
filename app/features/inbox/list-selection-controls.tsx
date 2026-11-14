import type * as React from "react";
import { PiTrash, PiX } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ListTrash } from "./use-list-trash";

/** The header checkbox that selects every loaded conversation the person can organize. */
export function SelectAllCheckbox({ listTrash }: { listTrash: ListTrash }): React.ReactElement {
  const { selectableCount, selectedCount } = listTrash;
  return (
    <Checkbox
      aria-label="Select all conversations"
      checked={
        selectedCount === 0 ? false : selectedCount === selectableCount ? true : "indeterminate"
      }
      className="border-muted-foreground/60 shadow-none"
      onCheckedChange={(checked) => listTrash.selectAll(checked === true)}
    />
  );
}

/** The header actions for the selected conversations. */
export function SelectionActions({ listTrash }: { listTrash: ListTrash }): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      <Button
        className="gap-1.5"
        disabled={listTrash.isTrashingSelection}
        onClick={() => void listTrash.trashSelection()}
        size="sm"
        type="button"
        variant="outline"
      >
        <PiTrash aria-hidden="true" className="pointer-events-none size-3.5" />
        Move to Trash
      </Button>
      <Button
        aria-label="Clear selection"
        disabled={listTrash.isTrashingSelection}
        onClick={listTrash.clearSelection}
        size="icon"
        type="button"
        variant="ghost"
      >
        <PiX aria-hidden="true" className="pointer-events-none size-3.5" />
      </Button>
    </div>
  );
}

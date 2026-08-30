import type * as React from "react";
import { PiTag } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { LabelColorDot } from "./label-colors";
import { LabelStack } from "./label-controls";
import type { MailLabel } from "./types";

export function LabelFilter({
  labels,
  values,
  onChange
}: {
  labels: MailLabel[];
  values: readonly string[];
  onChange: (labelIds: string[]) => void;
}): React.ReactElement | null {
  if (labels.length === 0) return null;
  const selectedIds = new Set(values);
  const selectedLabels = labels.filter((label) => selectedIds.has(label.id));

  function toggle(labelId: string, selected: boolean): void {
    const next = new Set(values);
    if (selected) next.add(labelId);
    else next.delete(labelId);
    onChange(labels.filter((label) => next.has(label.id)).map((label) => label.id));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={
            values.length === 0
              ? "Filter by labels"
              : `Filter by labels: ${selectedLabels.map((label) => label.name).join(", ")}`
          }
          className="h-7 min-h-7 max-w-[min(14rem,50vw)] gap-1 rounded-full bg-muted/50 px-2 text-[11px] font-normal text-muted-foreground shadow-none"
          size="sm"
          type="button"
          variant="ghost"
        >
          <PiTag aria-hidden="true" className="size-[11px] shrink-0" data-label-filter-icon="tag" />
          {selectedLabels.length > 0 ? (
            <LabelStack compact labels={selectedLabels} />
          ) : (
            <span>Labels</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-1 text-xs">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1 text-[10px] text-muted-foreground">
            Filter by every selected label
          </DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={values.length === 0}
            className="min-h-7 py-1 text-xs"
            onCheckedChange={(checked) => {
              if (checked) onChange([]);
            }}
            onSelect={(event) => event.preventDefault()}
          >
            All labels
          </DropdownMenuCheckboxItem>
          {labels.map((label) => (
            <DropdownMenuCheckboxItem
              checked={selectedIds.has(label.id)}
              className="min-h-7 py-1 text-xs"
              key={label.id}
              onCheckedChange={(checked) => toggle(label.id, checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              <span className="flex min-w-0 items-center gap-2">
                <LabelColorDot color={label.color} />
                <span className="truncate">{label.name}</span>
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import * as React from "react";
import { PiTag } from "react-icons/pi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { LabelColorDot, labelPillColorClass } from "./label-colors";
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
            values.length === 0 ? "Filter by labels" : `Filter by labels, ${values.length} selected`
          }
          className="h-8 min-h-8 rounded-full bg-muted/70 px-2.5 text-xs shadow-none"
          size="sm"
          type="button"
          variant="ghost"
        >
          <PiTag aria-hidden="true" />
          <span>Labels</span>
          {values.length > 0 ? (
            <span className="rounded-full bg-background/80 px-1.5 text-[10px] tabular-nums">
              {values.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Filter by every selected label
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={values.length === 0}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LabelMenu({
  assigned,
  canOrganizeLabels = true,
  className,
  disabled = false,
  labels,
  onToggle
}: {
  assigned: MailLabel[];
  canOrganizeLabels?: boolean;
  className?: string;
  disabled?: boolean;
  labels: MailLabel[];
  onToggle: (label: MailLabel, assigned: boolean) => Promise<void> | void;
}): React.ReactElement {
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const assignedIds = new Set(assigned.map((label) => label.id));

  async function toggle(label: MailLabel, nextAssigned: boolean): Promise<void> {
    setPendingId(label.id);
    try {
      await onToggle(label, nextAssigned);
      toast.success(
        nextAssigned ? `Label “${label.name}” added.` : `Label “${label.name}” removed.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Label could not be updated.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Labels"
          className={cn(
            "size-10 min-h-10 min-w-10 text-muted-foreground sm:size-8 sm:min-h-8 sm:min-w-8",
            className
          )}
          disabled={disabled || !canOrganizeLabels || labels.length === 0 || pendingId !== null}
          size="icon"
          title={
            labels.length === 0
              ? "Create a label in Settings first"
              : canOrganizeLabels
                ? "Labels"
                : "You need Handle access to change labels"
          }
          type="button"
          variant="ghost"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <PiTag aria-hidden="true" className="pointer-events-none" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">Labels</DropdownMenuLabel>
        {labels.map((label) => {
          const checked = assignedIds.has(label.id);
          return (
            <DropdownMenuCheckboxItem
              checked={checked}
              disabled={pendingId !== null}
              key={label.id}
              onCheckedChange={(next) => void toggle(label, next === true)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <LabelColorDot color={label.color} />
                <span className="truncate">{label.name}</span>
              </span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LabelBadges({ labels }: { labels: MailLabel[] }): React.ReactElement | null {
  if (labels.length === 0) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {labels.map((label) => (
        <span
          className={cn(
            "inline-flex max-w-28 items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
            labelPillColorClass(label.color)
          )}
          key={label.id}
          title={label.name}
        >
          <span className="truncate">{label.name}</span>
        </span>
      ))}
    </span>
  );
}

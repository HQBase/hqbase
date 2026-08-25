import * as React from "react";
import { PiDotsThree, PiTag } from "react-icons/pi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
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
          <PiTag aria-hidden="true" className="size-3 shrink-0" data-label-filter-icon="tag" />
          {selectedLabels.length > 0 ? (
            <LabelStack compact labels={selectedLabels} />
          ) : (
            <span>Labels</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-1 text-xs">
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
  onToggle,
  showTagIcon = false
}: {
  assigned: MailLabel[];
  canOrganizeLabels?: boolean;
  className?: string;
  disabled?: boolean;
  labels: MailLabel[];
  onToggle: (label: MailLabel, assigned: boolean) => Promise<void> | void;
  showTagIcon?: boolean;
}): React.ReactElement {
  const { pendingId, toggle } = useLabelToggle(onToggle);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Labels"
          className={cn(
            "relative size-10 min-h-10 min-w-10 text-muted-foreground sm:size-8 sm:min-h-8 sm:min-w-8 [&_svg]:size-3.5",
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
          {showTagIcon ? (
            <PiTag aria-hidden="true" className="pointer-events-none" data-label-menu-icon="tag" />
          ) : (
            <PiDotsThree
              aria-hidden="true"
              className="pointer-events-none"
              data-label-menu-icon="more"
            />
          )}
          {assigned.length > 0 && !showTagIcon ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-1 flex -space-x-0.5"
            >
              {assigned.slice(0, 3).map((label) => (
                <span
                  className={cn("size-1.5 rounded-full", labelPillColorClass(label.color))}
                  key={label.id}
                />
              ))}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 p-1 text-xs"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel className="px-2 py-1 text-[10px] text-muted-foreground">
          Labels
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <LabelMenuItems
            assigned={assigned}
            disabled={!canOrganizeLabels}
            labels={labels}
            pendingId={pendingId}
            onToggle={toggle}
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LabelMenuItems({
  assigned,
  className,
  disabled = false,
  keepOpen = false,
  labels,
  onToggle,
  pendingId = null
}: {
  assigned: MailLabel[];
  className?: string;
  disabled?: boolean;
  keepOpen?: boolean;
  labels: MailLabel[];
  onToggle: (label: MailLabel, assigned: boolean) => Promise<void> | void;
  pendingId?: string | null;
}): React.ReactElement {
  const assignedIds = new Set(assigned.map((label) => label.id));

  return (
    <>
      {labels.map((label) => (
        <DropdownMenuCheckboxItem
          checked={assignedIds.has(label.id)}
          className={cn("min-h-7 py-1 text-xs", className)}
          disabled={disabled || pendingId !== null}
          key={label.id}
          onCheckedChange={(next) => void onToggle(label, next === true)}
          {...(keepOpen ? { onSelect: (event: Event) => event.preventDefault() } : {})}
        >
          <span className="flex min-w-0 items-center gap-2">
            <LabelColorDot color={label.color} />
            <span className="truncate">{label.name}</span>
          </span>
        </DropdownMenuCheckboxItem>
      ))}
    </>
  );
}

export function useLabelToggle(
  onToggle?: (label: MailLabel, assigned: boolean) => Promise<void> | void
): {
  pendingId: string | null;
  toggle: (label: MailLabel, assigned: boolean) => Promise<void>;
} {
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function toggle(label: MailLabel, assigned: boolean): Promise<void> {
    if (!onToggle) return;
    setPendingId(label.id);
    try {
      await onToggle(label, assigned);
      toast.success(assigned ? `Label “${label.name}” added.` : `Label “${label.name}” removed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Label could not be updated.");
    } finally {
      setPendingId(null);
    }
  }

  return { pendingId, toggle };
}

export function LabelBadges({ labels }: { labels: MailLabel[] }): React.ReactElement | null {
  if (labels.length === 0) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {labels.map((label) => (
        <span
          className={cn(
            "inline-flex min-w-10 max-w-28 items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium",
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

export function LabelStack({
  className,
  compact = false,
  labels,
  namedLimit = 3
}: {
  className?: string;
  compact?: boolean;
  labels: MailLabel[];
  namedLimit?: number;
}): React.ReactElement | null {
  if (labels.length === 0) return null;
  const named = labels.slice(0, namedLimit);
  const stacked = labels.slice(namedLimit);
  const shownColors = stacked.slice(0, 5);

  return (
    <span
      aria-label={labels.map((label) => label.name).join(", ")}
      className={cn("flex min-w-0 items-center gap-1", className)}
      data-label-stack
      role="img"
      title={labels.map((label) => label.name).join(", ")}
    >
      {named.map((label) => (
        <span
          className={cn(
            "inline-flex min-w-10 max-w-24 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            compact && "max-w-20 px-1 py-0 text-[9px]",
            labelPillColorClass(label.color)
          )}
          key={label.id}
        >
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {shownColors.length > 0 ? (
        <span aria-hidden="true" className="flex shrink-0 -space-x-1">
          {shownColors.map((label) => (
            <span
              className={cn(
                "h-4 w-1.5 rounded-full",
                compact && "h-3.5 w-1",
                labelPillColorClass(label.color)
              )}
              data-label-stack-color={label.color}
              key={label.id}
            />
          ))}
        </span>
      ) : null}
      {stacked.length > shownColors.length ? (
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
          +{stacked.length - shownColors.length}
        </span>
      ) : null}
    </span>
  );
}

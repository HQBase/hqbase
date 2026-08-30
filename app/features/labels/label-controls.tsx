import * as React from "react";
import { PiDotsThree, PiPlus, PiTag } from "react-icons/pi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { LabelColorDot, labelPillColorClass } from "./label-colors";
import { LabelEditorDialog } from "./label-editor-dialog";
import type { MailLabel } from "./types";

export function LabelMenu({
  align = "end",
  assigned,
  canCreateLabels = false,
  canOrganizeLabels = true,
  className,
  compactAssignedLabels = true,
  disabled = false,
  emptyAssignedText,
  labels,
  onLabelsChanged,
  onToggle,
  showAssignedLabels = false,
  showTagIcon = false
}: {
  align?: "start" | "center" | "end";
  assigned: MailLabel[];
  canCreateLabels?: boolean;
  canOrganizeLabels?: boolean;
  className?: string;
  compactAssignedLabels?: boolean;
  disabled?: boolean;
  emptyAssignedText?: string;
  labels: MailLabel[];
  onLabelsChanged?: (() => Promise<void>) | undefined;
  onToggle: (label: MailLabel, assigned: boolean) => Promise<void> | void;
  showAssignedLabels?: boolean;
  showTagIcon?: boolean;
}): React.ReactElement {
  const { pendingId, toggle } = useLabelToggle(onToggle);
  const [creating, setCreating] = React.useState(false);
  const [optimisticAssigned, updateOptimisticAssigned] = React.useOptimistic(
    assigned,
    (
      current,
      change: {
        assigned: boolean;
        label: MailLabel;
      }
    ) => {
      if (!change.assigned) return current.filter((label) => label.id !== change.label.id);
      if (current.some((label) => label.id === change.label.id)) return current;
      return [...current, change.label].sort((left, right) => left.name.localeCompare(right.name));
    }
  );
  const triggerLabel =
    showAssignedLabels && optimisticAssigned.length > 0
      ? `Labels: ${optimisticAssigned.map((label) => label.name).join(", ")}`
      : (emptyAssignedText ?? "Labels");

  function toggleOptimistically(label: MailLabel, nextAssigned: boolean): void {
    const request = toggle(label, nextAssigned);
    React.startTransition(async () => {
      updateOptimisticAssigned({ assigned: nextAssigned, label });
      await request;
    });
  }

  async function created(label: MailLabel): Promise<void> {
    setCreating(false);
    await toggle(label, true);
    await onLabelsChanged?.();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={triggerLabel}
            className={cn(
              "relative text-muted-foreground [&_svg]:size-3.5",
              showAssignedLabels
                ? "h-auto min-h-0 w-fit min-w-0 gap-0.5 rounded-full p-0.5"
                : "size-10 min-h-10 min-w-10 sm:size-8 sm:min-h-8 sm:min-w-8",
              className
            )}
            aria-busy={pendingId !== null}
            data-message-labels={showAssignedLabels ? "desktop" : undefined}
            disabled={disabled || !canOrganizeLabels || (labels.length === 0 && !canCreateLabels)}
            size="icon"
            title={
              labels.length === 0 && !canCreateLabels
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
            {showAssignedLabels && optimisticAssigned.length > 0 ? (
              <LabelStack compact={compactAssignedLabels} labels={optimisticAssigned} />
            ) : showAssignedLabels && emptyAssignedText ? (
              <span
                className={cn(
                  "shrink-0 leading-4",
                  compactAssignedLabels ? "text-[9px]" : "text-[10px]"
                )}
              >
                {emptyAssignedText}
              </span>
            ) : null}
            {showTagIcon ? (
              <PiTag
                aria-hidden="true"
                className="pointer-events-none"
                data-label-menu-icon="tag"
              />
            ) : (
              <PiDotsThree
                aria-hidden="true"
                className="pointer-events-none"
                data-label-menu-icon="more"
              />
            )}
            {optimisticAssigned.length > 0 && !showTagIcon ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-1 flex -space-x-0.5"
              >
                {optimisticAssigned.slice(0, 3).map((label) => (
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
          align={align}
          className="w-52 p-1 text-xs"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 py-1 text-[10px] text-muted-foreground">
              {labels.length === 0 ? "No labels yet" : "Labels"}
            </DropdownMenuLabel>
            {labels.length > 0 ? (
              <LabelMenuItems
                assigned={optimisticAssigned}
                disabled={!canOrganizeLabels}
                labels={labels}
                pendingId={pendingId}
                onToggle={toggleOptimistically}
              />
            ) : null}
          </DropdownMenuGroup>
          {canCreateLabels ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem className="gap-2" onSelect={() => setCreating(true)}>
                  <PiPlus aria-hidden="true" />
                  Create label
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <LabelEditorDialog
        editing={creating ? "new" : null}
        onOpenChange={(open) => !open && setCreating(false)}
        onSaved={created}
      />
    </>
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

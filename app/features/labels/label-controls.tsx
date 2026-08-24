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
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { cn } from "@/lib/cn";
import { LabelColorDot } from "./label-colors";
import type { MailLabel } from "./types";

export function LabelFilter({
  labels,
  value,
  onChange
}: {
  labels: MailLabel[];
  value: string;
  onChange: (labelId: string) => void;
}): React.ReactElement | null {
  if (labels.length === 0) return null;
  return (
    <DropdownSelect
      ariaLabel="Filter by label"
      className="w-44 bg-muted/60 px-2.5 text-xs shadow-none"
      options={[
        { label: "All labels", value: "all" },
        ...labels.map((label) => ({
          label: (
            <span className="flex min-w-0 items-center gap-2">
              <LabelColorDot color={label.color} />
              <span className="truncate">{label.name}</span>
            </span>
          ),
          value: label.id
        }))
      ]}
      value={value}
      onValueChange={onChange}
    />
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
  const visible = labels.slice(0, 2);
  return (
    <span className="inline-flex min-w-0 shrink items-center gap-1">
      {visible.map((label) => (
        <span
          className="inline-flex max-w-24 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          key={label.id}
          title={label.name}
        >
          <LabelColorDot className="size-1.5" color={label.color} />
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {labels.length > visible.length ? (
        <span className="text-[10px] text-muted-foreground">+{labels.length - visible.length}</span>
      ) : null}
    </span>
  );
}

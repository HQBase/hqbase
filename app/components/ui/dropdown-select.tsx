import type * as React from "react";
import { PiCaretDown } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

export type DropdownSelectOption = {
  disabled?: boolean;
  label: React.ReactNode;
  value: string;
};

type DropdownSelectProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  open?: boolean;
  options: DropdownSelectOption[];
  placeholder?: React.ReactNode;
  required?: boolean;
  size?: "default" | "sm";
  value: string;
  onOpenChange?: (open: boolean) => void;
  onValueChange: (value: string) => void;
};

export function DropdownSelect({
  ariaLabel,
  className,
  disabled = false,
  id,
  open,
  options,
  placeholder = "Choose an option",
  required = false,
  size = "default",
  value,
  onOpenChange,
  onValueChange
}: DropdownSelectProps): React.ReactElement {
  const selected = options.find((option) => option.value === value);

  return (
    <DropdownMenu
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={ariaLabel}
          aria-required={required || undefined}
          className={cn(
            "w-full justify-between overflow-hidden rounded-[calc(var(--radius)+2px)] px-3 font-normal shadow-sm",
            size === "sm" ? "h-[30px] min-h-[30px]" : "h-[34px] min-h-[34px]",
            className
          )}
          data-size={size}
          disabled={disabled}
          id={id}
          type="button"
          variant="outline"
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selected?.label ?? placeholder}
          </span>
          <PiCaretDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[min(24rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              className="data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
              key={option.value}
              value={option.value}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

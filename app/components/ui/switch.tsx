import * as React from "react";

import { cn } from "@/lib/cn";

type SwitchProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-checked" | "onClick" | "role" | "type"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, className, onCheckedChange, ...props }, ref) => (
    <button
      aria-checked={checked}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-input px-0.5 shadow-sm transition-[background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        checked ? "bg-foreground/90" : "bg-muted",
        className
      )}
      ref={ref}
      role="switch"
      type="button"
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-5 rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none",
          checked ? "translate-x-5 bg-card" : "translate-x-0"
        )}
      />
    </button>
  )
);
Switch.displayName = "Switch";

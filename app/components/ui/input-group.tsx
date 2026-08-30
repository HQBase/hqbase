import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        "flex h-[38px] min-w-0 w-full items-center rounded-[calc(var(--radius)+2px)] border border-input bg-background shadow-sm transition-[color,background-color,border-color,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-ring data-[invalid=true]:border-destructive motion-reduce:transition-none [&_input]:rounded-[calc(var(--radius)-2px)]",
        className
      )}
      data-slot="input-group"
      ref={ref}
      role="group"
      {...props}
    />
  )
);
InputGroup.displayName = "InputGroup";

export const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <Input
    className={cn(
      "min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0",
      className
    )}
    data-slot="input-group-control"
    ref={ref}
    {...props}
  />
));
InputGroupInput.displayName = "InputGroupInput";

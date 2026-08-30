import * as React from "react";

import { Input, type InputProps, type InputSize } from "@/components/ui/input";
import { cn } from "@/lib/cn";

type InputGroupProps = React.HTMLAttributes<HTMLDivElement> & { size?: InputSize };

export const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, size = "default", ...props }, ref) => (
    <div
      className={cn(
        "flex min-w-0 w-full items-center rounded-[calc(var(--radius)+2px)] border border-input bg-background shadow-sm transition-[color,background-color,border-color] duration-200 focus-within:border-ring focus-within:shadow-none data-[invalid=true]:border-destructive motion-reduce:transition-none [&_input]:rounded-[calc(var(--radius)-2px)]",
        size === "sm" ? "h-[30px]" : "h-[38px]",
        className
      )}
      data-size={size}
      data-slot="input-group"
      ref={ref}
      role="group"
      {...props}
    />
  )
);
InputGroup.displayName = "InputGroup";

export const InputGroupInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input
      className={cn(
        "h-full min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0",
        className
      )}
      data-slot="input-group-control"
      ref={ref}
      {...props}
    />
  )
);
InputGroupInput.displayName = "InputGroupInput";

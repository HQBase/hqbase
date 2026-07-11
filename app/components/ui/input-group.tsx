import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        "flex h-9 min-w-0 w-full items-center rounded-md border border-input bg-background shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring data-[invalid=true]:border-destructive",
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

export const InputGroupAddon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { align?: "inline-start" | "inline-end" }
>(({ align = "inline-start", className, ...props }, ref) => (
  <div
    className={cn(
      "flex h-full max-w-[65%] shrink-0 items-center bg-muted/45 px-3 text-sm text-muted-foreground",
      align === "inline-start" ? "order-first border-r" : "order-last border-l",
      className
    )}
    data-align={align}
    data-slot="input-group-addon"
    ref={ref}
    {...props}
  />
));
InputGroupAddon.displayName = "InputGroupAddon";

export function InputGroupText({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement {
  return <span className={cn("truncate", className)} {...props} />;
}

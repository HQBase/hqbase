import * as React from "react";

import { cn } from "@/lib/cn";

export type InputSize = "default" | "sm";

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: InputSize;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = "default", type, ...props }, ref) => (
    <input
      className={cn(
        "flex w-full rounded-[calc(var(--radius)+2px)] border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-[color,background-color,border-color] duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:shadow-none aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        size === "sm" ? "h-[30px]" : "h-[38px]",
        className
      )}
      data-size={size}
      ref={ref}
      type={type}
      {...props}
    />
  )
);
Input.displayName = "Input";

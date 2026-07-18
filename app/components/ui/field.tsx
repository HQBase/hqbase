import { Info } from "lucide-react";
import type * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

export function FieldGroup({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return <div className={cn("flex w-full flex-col gap-5", className)} {...props} />;
}

export function Field({ className, ...props }: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("flex w-full flex-col gap-2", className)}
      data-slot="field"
      role="group"
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>): React.ReactElement {
  return <Label className={cn("leading-snug", className)} data-slot="field-label" {...props} />;
}

export function FieldLabelRow({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex min-h-5 items-center justify-between gap-3 [&_[data-slot=field-error]]:ml-auto [&_[data-slot=field-error]]:max-w-[70%] [&_[data-slot=field-error]]:text-right",
        className
      )}
      data-slot="field-label-row"
      {...props}
    />
  );
}

export function FieldDescription({
  className,
  children,
  ...props
}: React.ComponentProps<"p">): React.ReactElement {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs font-normal leading-4 text-muted-foreground",
        className
      )}
      data-slot="field-description"
      {...props}
    >
      <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function FieldError({ className, ...props }: React.ComponentProps<"p">): React.ReactElement {
  return (
    <p
      className={cn("text-xs font-normal leading-4 text-destructive", className)}
      data-slot="field-error"
      role="alert"
      {...props}
    />
  );
}

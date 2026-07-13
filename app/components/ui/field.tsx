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
      className={cn("flex w-full flex-col gap-2 data-[invalid=true]:text-destructive", className)}
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

export function FieldDescription({
  className,
  ...props
}: React.ComponentProps<"p">): React.ReactElement {
  return (
    <p
      className={cn("text-sm font-normal leading-5 text-muted-foreground", className)}
      data-slot="field-description"
      {...props}
    />
  );
}

export function FieldError({ className, ...props }: React.ComponentProps<"p">): React.ReactElement {
  return (
    <p
      className={cn("text-sm font-normal leading-5 text-destructive", className)}
      data-slot="field-error"
      role="alert"
      {...props}
    />
  );
}

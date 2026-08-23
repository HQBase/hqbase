import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";
import { PiX } from "react-icons/pi";

import { cn } from "@/lib/cn";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetPortal = DialogPrimitive.Portal;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
  side?: "left" | "right";
};

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, overlayClassName, side = "right", ...props }, ref) => (
  <SheetPortal>
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-foreground/25 data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in motion-reduce:animate-none",
        overlayClassName
      )}
    />
    <DialogPrimitive.Content
      className={cn(
        "fixed inset-y-0 z-50 w-[min(92vw,480px)] bg-background p-5 shadow-lg motion-reduce:animate-none",
        side === "left"
          ? "left-0 border-r data-[state=closed]:animate-sheet-out-left data-[state=open]:animate-sheet-in-left"
          : "right-0 border-l max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-md:pt-[max(1.25rem,env(safe-area-inset-top))] data-[state=closed]:animate-sheet-out-right data-[state=open]:animate-sheet-in-right",
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className={cn(
          "absolute right-3 top-3 inline-flex size-10 min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,transform] duration-200 [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] will-change-transform motion-reduce:transition-none",
          side === "right" && "max-md:top-[max(0.75rem,env(safe-area-inset-top))]"
        )}
      >
        <PiX />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

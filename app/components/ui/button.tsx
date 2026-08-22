import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-200 ease-out will-change-auto active:scale-[0.97] active:will-change-transform motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [@media(hover:hover)]:hover:bg-primary/92",
        destructive:
          "bg-destructive text-destructive-foreground [@media(hover:hover)]:hover:bg-destructive/90",
        outline: "border border-input bg-background [@media(hover:hover)]:hover:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground [@media(hover:hover)]:hover:bg-secondary/80",
        ghost: "[@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground",
        link: "text-primary underline-offset-4 [@media(hover:hover)]:hover:underline",
        liquidGlass: "btn-liquid-glass rounded-full"
      },
      size: {
        default: "h-10 px-4 py-2 min-h-10",
        sm: "h-10 min-h-10 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-5",
        icon: "size-10 min-h-10 min-w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-[color,background-color,border-color,opacity,box-shadow] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
        default: "h-[30px] min-h-[30px] px-4 py-1",
        sm: "h-[27px] min-h-[27px] rounded-md px-3 text-xs",
        lg: "h-[33px] min-h-[33px] rounded-md px-5",
        icon: "size-[30px] min-h-[30px] min-w-[30px]",
        field: "h-[38px] min-h-[38px] px-4 text-[13px]",
        fieldIcon: "size-[38px] min-h-[38px] min-w-[38px]"
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

import * as React from "react";

import { cn } from "@/lib/cn";

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value = 0, ...props }, ref) => (
  <div
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={value}
    className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    ref={ref}
    role="progressbar"
    {...props}
  >
    <div
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - value}%)` }}
    />
  </div>
));
Progress.displayName = "Progress";

export { Progress };

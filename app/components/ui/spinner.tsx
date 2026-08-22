import { PiCircleNotch } from "react-icons/pi";

import { cn } from "@/lib/cn";

function Spinner({ className, ...props }: React.ComponentProps<typeof PiCircleNotch>) {
  return (
    <PiCircleNotch
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      role="status"
      {...props}
    />
  );
}

export { Spinner };

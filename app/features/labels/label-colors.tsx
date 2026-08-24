import type * as React from "react";
import { cn } from "@/lib/cn";
import type { LabelColor } from "./types";

const colorClasses: Record<LabelColor, string> = {
  gray: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500"
};

export function LabelColorDot({
  className,
  color
}: {
  className?: string;
  color: LabelColor;
}): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2.5 shrink-0 rounded-full", colorClasses[color], className)}
    />
  );
}

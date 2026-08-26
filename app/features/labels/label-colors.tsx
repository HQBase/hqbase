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

const pillColorClasses: Record<LabelColor, string> = {
  gray: "bg-slate-500/15 text-slate-700 dark:text-slate-200",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  amber: "bg-amber-500/20 text-amber-800 dark:text-amber-200",
  green: "bg-green-500/15 text-green-700 dark:text-green-300",
  teal: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  indigo: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  purple: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  pink: "bg-pink-500/15 text-pink-700 dark:text-pink-300"
};

export function labelPillColorClass(color: LabelColor): string {
  return pillColorClasses[color];
}

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

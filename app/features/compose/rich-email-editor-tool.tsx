import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function Tool({
  active = false,
  children,
  disabled = false,
  label,
  onClick
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className="size-10 min-h-10 min-w-10"
      disabled={disabled}
      size="icon"
      type="button"
      variant={active ? "secondary" : "ghost"}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

import { Info } from "lucide-react";
import * as React from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function RoleGuidance(): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            aria-label="About workspace roles"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpen(true)}
            type="button"
          >
            <Info aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          align="end"
          className="z-50 w-[min(20rem,calc(100vw-2rem))] border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg"
          sideOffset={8}
        >
          <RoleGuidanceCopy />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function RoleGuidanceCopy(): React.ReactElement {
  return (
    <div className="space-y-2.5 leading-relaxed">
      <RoleDescription
        description="Manages the workspace, controls owner membership, and can access every mailbox."
        label="Owner"
      />
      <RoleDescription
        description="Manages the workspace but cannot change owner membership. Mailbox access requires an explicit grant."
        label="Admin"
      />
      <RoleDescription
        description="Uses the workspace without managing it. Mailbox access requires an explicit grant."
        label="Member"
      />
    </div>
  );
}

function RoleDescription({
  description,
  label
}: {
  description: string;
  label: string;
}): React.ReactElement {
  return (
    <div>
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

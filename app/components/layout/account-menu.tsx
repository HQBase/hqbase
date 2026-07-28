import { ChevronDown, LogOut } from "lucide-react";
import type * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/features/auth/api";
import type { CurrentUser } from "@/features/auth/types";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

type AccountMenuProps = {
  drawer?: boolean;
  user: CurrentUser;
  onSignedOut: () => void;
};

export function AccountMenu({
  drawer = false,
  user,
  onSignedOut
}: AccountMenuProps): React.ReactElement {
  async function handleSignOut(): Promise<void> {
    await signOut();
    onSignedOut();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open profile menu"
          className={cn(
            "h-10 w-full justify-start gap-2.5 px-2.5 text-left font-normal",
            drawer && "h-11"
          )}
          type="button"
          variant="ghost"
        >
          <Avatar className="size-7 border">
            <AvatarFallback className="text-[11px] font-medium">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-foreground">{user.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{user.role}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
            strokeWidth={1.5}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" side="top">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-1">
            <span>{user.name}</span>
            <span className="text-xs font-normal text-muted-foreground">{user.role}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem className="gap-2" onSelect={() => void handleSignOut()}>
            <LogOut className="size-4" strokeWidth={1.5} />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

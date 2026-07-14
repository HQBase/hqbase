import { LogOut, MailPlus, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { signOut } from "@/features/auth/api";
import type { CurrentUser } from "@/features/auth/types";
import type { Mailbox } from "@/features/mailboxes/types";
import { initials } from "@/lib/format";

type TopBarProps = {
  user: CurrentUser;
  mailboxes: Mailbox[];
  mailboxId: string;
  search: string;
  onCompose: () => void;
  onMailboxChange: (mailboxId: string) => void;
  onSearchChange: (search: string) => void;
  onSignedOut: () => void;
};

export function TopBar({
  user,
  mailboxes,
  mailboxId,
  search,
  onCompose,
  onMailboxChange,
  onSearchChange,
  onSignedOut
}: TopBarProps): React.ReactElement {
  async function handleSignOut() {
    await signOut();
    onSignedOut();
  }

  return (
    <header className="flex h-14 w-full shrink-0 items-center gap-2 border-b bg-background px-3 md:px-4">
      <div className="relative min-w-0 max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 border-transparent bg-muted/70 pl-8 shadow-none focus-visible:border-input focus-visible:ring-1"
          placeholder="Search mail"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Select value={mailboxId} onValueChange={onMailboxChange}>
          <SelectTrigger className="hidden h-8 w-52 border-transparent bg-muted/70 shadow-none lg:flex">
            <SelectValue placeholder="All mailboxes" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All mailboxes</SelectItem>
              {mailboxes.map((mailbox) => (
                <SelectItem key={mailbox.id} value={mailbox.id}>
                  {mailbox.address}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button aria-label="Compose" className="h-8 px-3" onClick={onCompose} type="button">
          <MailPlus />
          <span className="hidden sm:inline">Compose</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="size-8 rounded-full" size="icon" type="button" variant="ghost">
              <Avatar className="size-7 border">
                <AvatarFallback className="text-[11px] font-medium">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span>{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{user.role}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => void handleSignOut()}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

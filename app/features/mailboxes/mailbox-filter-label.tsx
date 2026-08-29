import type * as React from "react";

import type { Mailbox } from "./types";

export function MailboxFilterLabel({ mailbox }: { mailbox: Mailbox }): React.ReactElement {
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate">{mailbox.address}</span>
      {!mailbox.isActive ? (
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">Disabled</span>
      ) : null}
    </span>
  );
}

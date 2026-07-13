import { Paperclip, Star } from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { MessageSummary } from "./types";

type MessageListItemProps = {
  message: MessageSummary;
  isActive: boolean;
  onSelect: (message: MessageSummary) => void;
};

export function MessageListItem({
  message,
  isActive,
  onSelect
}: MessageListItemProps): React.ReactElement {
  return (
    <button
      className={cn(
        "relative grid w-full gap-1.5 border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-muted/55",
        isActive && "bg-muted/85",
        message.readAt === null && !isActive && "bg-card/70"
      )}
      onClick={() => onSelect(message)}
      type="button"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {message.readAt === null && (
            <span className="size-1.5 shrink-0 rounded-full bg-foreground" />
          )}
          <span className={cn("truncate text-[13px]", message.readAt === null && "font-medium")}>
            {message.fromAddress}
          </span>
        </div>
        <div className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {formatDateTime(message.receivedAt ?? message.sentAt ?? message.createdAt)}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {message.starredAt && <Star className="size-3 fill-foreground text-foreground" />}
        <span className={cn("truncate text-[13px]", message.readAt === null && "font-medium")}>
          {message.subject}
        </span>
        {message.hasAttachments && <Paperclip className="size-3 text-muted-foreground" />}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-[12px] leading-5 text-muted-foreground">
          {message.snippet || "No preview"}
        </p>
        {message.folder === "catchall" && (
          <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
            Unknown
          </Badge>
        )}
      </div>
    </button>
  );
}

export function EmptyMessageList(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <div className="flex size-9 items-center justify-center rounded-md border bg-card">
        <Paperclip className="size-4" />
      </div>
      <div className="text-xs">No messages in this view</div>
    </div>
  );
}

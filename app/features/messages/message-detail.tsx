import { Archive, Download, MailOpen, MailPlus, Star, Trash2 } from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/format";
import type { MessageDetail as MessageDetailType } from "./types";

type MessageDetailProps = {
  message: MessageDetailType | null;
  onAction: (action: "read" | "unread" | "star" | "unstar" | "archive" | "trash") => void;
  onReply: (message: MessageDetailType) => void;
};

export function MessageDetail({
  message,
  onAction,
  onReply
}: MessageDetailProps): React.ReactElement {
  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <div className="flex size-9 items-center justify-center rounded-md border bg-card">
          <MailOpen className="size-4" />
        </div>
        <span className="text-xs">Select a message</span>
      </div>
    );
  }

  const timestamp = message.receivedAt ?? message.sentAt ?? message.createdAt;

  return (
    <article className="flex h-full flex-col bg-background">
      <div className="border-b px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-medium tracking-tight sm:text-xl">
              {message.subject}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="text-foreground">{message.fromAddress}</span>
              <span aria-hidden="true">→</span>
              <span>{message.to.join(", ")}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[10px]">{formatDateTime(timestamp)}</span>
              {message.folder === "catchall" && (
                <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
                  Catch-all
                </Badge>
              )}
            </div>
            {message.cc.length > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">Cc {message.cc.join(", ")}</div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-0.5 rounded-md border bg-card p-0.5">
            <IconButton label="Reply" onClick={() => onReply(message)}>
              <MailPlus />
            </IconButton>
            <IconButton
              label={message.readAt ? "Mark unread" : "Mark read"}
              onClick={() => onAction(message.readAt ? "unread" : "read")}
            >
              <MailOpen />
            </IconButton>
            <IconButton
              label={message.starredAt ? "Unstar" : "Star"}
              onClick={() => onAction(message.starredAt ? "unstar" : "star")}
            >
              <Star />
            </IconButton>
            <IconButton label="Archive" onClick={() => onAction("archive")}>
              <Archive />
            </IconButton>
            <IconButton label="Trash" onClick={() => onAction("trash")}>
              <Trash2 />
            </IconButton>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="max-w-3xl">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-foreground/90">
            {message.textBody || message.snippet}
          </pre>
          {message.htmlAvailable && (
            <p className="mt-6 rounded-md border bg-card p-3 text-xs text-muted-foreground">
              HTML is preserved. Text view shown for safety.
            </p>
          )}
          {message.attachments.length > 0 && (
            <>
              <Separator className="my-6" />
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground">Attachments</div>
                {message.attachments.map((attachment) => (
                  <a
                    className="flex w-fit items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs hover:bg-muted"
                    href={`/api/attachments/${attachment.id}`}
                    key={attachment.id}
                  >
                    <Download className="size-3.5" />
                    {attachment.filename}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function IconButton({
  children,
  label,
  onClick
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <Button
      aria-label={label}
      className="size-8 text-muted-foreground hover:text-foreground"
      onClick={onClick}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

import { PiPaperclip, PiX } from "react-icons/pi";
import { Button } from "@/components/ui/button";
import type { DraftAttachment } from "@/features/drafts/types";
import type { MessageDetail } from "@/features/messages/types";
export function AttachmentList({
  attachments,
  includedAttachments = [],
  onRemove
}: {
  attachments: DraftAttachment[];
  includedAttachments?: MessageDetail["attachments"];
  onRemove: (item: DraftAttachment) => void;
}) {
  const visibleAttachments = attachments.filter((attachment) => !attachment.inline);
  const visibleIncludedAttachments = includedAttachments.filter(
    (attachment) => attachment.disposition === "attachment"
  );
  if (!visibleAttachments.length && !visibleIncludedAttachments.length) return null;
  return (
    <div className="space-y-2 border-t px-5 py-3">
      {visibleIncludedAttachments.length ? (
        <p className="text-xs font-medium text-muted-foreground">Included from original message</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {visibleIncludedAttachments.map((item) => (
          <div
            className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs"
            key={`included-${item.id}`}
          >
            <PiPaperclip aria-hidden="true" className="pointer-events-none" />
            <span className="max-w-48 truncate">{item.filename}</span>
            <span className="text-muted-foreground">{formatBytes(item.sizeBytes)}</span>
          </div>
        ))}
        {visibleAttachments.map((item) => (
          <div
            className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs"
            key={item.id}
          >
            <PiPaperclip aria-hidden="true" className="pointer-events-none" />
            <span className="max-w-48 truncate">{item.filename}</span>
            <span className="text-muted-foreground">{formatBytes(item.sizeBytes)}</span>
            <Button
              aria-label={`Remove ${item.filename}`}
              className="size-10 min-h-10 min-w-10"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => onRemove(item)}
            >
              <PiX aria-hidden="true" className="pointer-events-none" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
function formatBytes(value: number) {
  return value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${Math.round(value / 1024)} KB`
      : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

import { PiPaperclip, PiX } from "react-icons/pi";
import { Button } from "@/components/ui/button";
import type { DraftAttachment } from "@/features/drafts/types";
export function AttachmentList({
  attachments,
  onRemove
}: {
  attachments: DraftAttachment[];
  onRemove: (item: DraftAttachment) => void;
}) {
  const visibleAttachments = attachments.filter((attachment) => !attachment.inline);
  if (!visibleAttachments.length) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t px-5 py-3">
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
  );
}
function formatBytes(value: number) {
  return value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${Math.round(value / 1024)} KB`
      : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

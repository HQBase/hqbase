import * as React from "react";
import { toast } from "sonner";

import { runConversationAction } from "@/features/messages/api";
import type { ConversationAction, ConversationSummary } from "@/features/messages/types";
import type { MailFolderId } from "@/lib/routes";

type ListTrashOptions = {
  activeFolder: MailFolderId;
  canOrganizeConversation: (mailboxId: string | null) => boolean;
  conversations: ConversationSummary[];
  onConversationAction: (threadId: string, action: ConversationAction, affected: number) => void;
  onRefresh: () => Promise<void> | void;
};

export type ListTrash = {
  /** False in Trash: a conversation there cannot move to Trash again. */
  enabled: boolean;
  isTrashingSelection: boolean;
  selectableCount: number;
  selectedCount: number;
  selectedThreadIds: ReadonlySet<string>;
  clearSelection: () => void;
  selectAll: (selected: boolean) => void;
  setSelected: (conversation: ConversationSummary, selected: boolean) => void;
  trashConversation: (conversation: ConversationSummary) => Promise<void>;
  trashSelection: () => Promise<void>;
};

/** Moves conversations to Trash from the conversation list, one row or a selection of rows. */
export function useListTrash({
  activeFolder,
  canOrganizeConversation,
  conversations,
  onConversationAction,
  onRefresh
}: ListTrashOptions): ListTrash {
  // The selection belongs to one folder.
  const [selection, setSelection] = React.useState<{
    folder: MailFolderId;
    threadIds: ReadonlySet<string>;
  }>({ folder: activeFolder, threadIds: new Set() });
  const [isTrashingSelection, setIsTrashingSelection] = React.useState(false);
  // Drop the selection when the folder changes, so that it does not return with the folder.
  if (selection.folder !== activeFolder) {
    setSelection({ folder: activeFolder, threadIds: new Set() });
  }

  const enabled = activeFolder !== "trash";
  const selectedThreadIds: ReadonlySet<string> =
    selection.folder === activeFolder ? selection.threadIds : new Set();
  const selectable = enabled
    ? conversations.filter((conversation) => canOrganizeConversation(conversation.mailboxId))
    : [];
  const selected = selectable.filter((conversation) =>
    selectedThreadIds.has(conversation.threadId)
  );

  function setSelectedThreadIds(threadIds: ReadonlySet<string>): void {
    setSelection({ folder: activeFolder, threadIds });
  }

  async function moveToTrash(conversation: ConversationSummary): Promise<void> {
    const updated = await runConversationAction(conversation.id, "trash", activeFolder);
    onConversationAction(updated.threadId, "trash", updated.affected);
  }

  function refresh(): void {
    void Promise.resolve(onRefresh()).catch(() => undefined);
  }

  return {
    enabled,
    isTrashingSelection,
    selectableCount: selectable.length,
    selectedCount: selected.length,
    selectedThreadIds,
    clearSelection: () => setSelectedThreadIds(new Set()),
    selectAll: (all) =>
      setSelectedThreadIds(
        all ? new Set(selectable.map((conversation) => conversation.threadId)) : new Set()
      ),
    setSelected: (conversation, isSelected) => {
      const next = new Set(selectedThreadIds);
      if (isSelected) next.add(conversation.threadId);
      else next.delete(conversation.threadId);
      setSelectedThreadIds(next);
    },
    trashConversation: async (conversation) => {
      try {
        await moveToTrash(conversation);
        toast.success("Conversation moved to Trash.");
      } catch {
        toast.error("The conversation could not be moved to Trash. Try again.");
      }
      refresh();
    },
    trashSelection: async () => {
      if (isTrashingSelection || selected.length === 0) return;
      setIsTrashingSelection(true);
      let moved = 0;
      let failed = 0;
      for (const conversation of selected) {
        try {
          await moveToTrash(conversation);
          moved += 1;
        } catch {
          failed += 1;
        }
      }
      setIsTrashingSelection(false);
      setSelectedThreadIds(new Set());
      if (moved > 0) {
        toast.success(
          moved === 1 ? "Conversation moved to Trash." : `${moved} conversations moved to Trash.`
        );
      }
      if (failed > 0) {
        toast.error(
          failed === 1
            ? "One conversation could not be moved to Trash. Try again."
            : `${failed} conversations could not be moved to Trash. Try again.`
        );
      }
      refresh();
    }
  };
}

import * as React from "react";
import type { MailLabel } from "@/features/labels/types";
import { createDraftSync } from "./sync-client";
import type { Draft } from "./types";

export function useDrafts(userId: string | null): {
  drafts: Draft[];
  isLoading: boolean;
  applyLabels: (draftId: string, labels: MailLabel[]) => void;
  refresh: () => Promise<void>;
  hardRefresh: () => Promise<void>;
} {
  const cache = React.useMemo(() => ({ userId, sync: createDraftSync() }), [userId]);
  const sync = cache.sync;
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const currentUserId = React.useRef(userId);
  currentUserId.current = userId;

  const refresh = React.useCallback(
    async (reset = false): Promise<void> => {
      if (!userId) {
        setDrafts([]);
        setIsLoading(false);
        return;
      }

      const nextDrafts = await sync.refresh(reset);
      if (currentUserId.current === userId) {
        setDrafts(nextDrafts);
        setIsLoading(false);
      }
    },
    [sync, userId]
  );

  const hardRefresh = React.useCallback(() => refresh(true), [refresh]);

  React.useEffect(() => {
    if (!userId) {
      setDrafts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void refresh().catch(() => {
      if (currentUserId.current === userId) setIsLoading(false);
    });

    const refreshWhenVisible = (): void => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh, userId]);

  const applyLabels = React.useCallback((draftId: string, labels: MailLabel[]): void => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === draftId ? { ...draft, labels } : draft))
    );
  }, []);

  return { applyLabels, drafts, isLoading, refresh, hardRefresh };
}

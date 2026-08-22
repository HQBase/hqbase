import * as React from "react";

import { listDrafts } from "./api";
import type { Draft } from "./types";

export function useDrafts(userId: string | null): {
  drafts: Draft[];
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const currentUserId = React.useRef(userId);
  currentUserId.current = userId;

  const refresh = React.useCallback(async (): Promise<void> => {
    if (!userId) {
      setDrafts([]);
      setIsLoading(false);
      return;
    }

    const nextDrafts = await listDrafts();
    if (currentUserId.current === userId) {
      setDrafts(nextDrafts);
      setIsLoading(false);
    }
  }, [userId]);

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

  return { drafts, isLoading, refresh };
}

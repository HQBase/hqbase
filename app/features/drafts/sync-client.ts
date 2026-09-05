import { listDraftChanges, listDrafts } from "./api";
import type { Draft } from "./types";

/** A cache belongs to one signed-in user. Access changes require a fresh snapshot. */
export function createDraftSync() {
  let drafts: Draft[] = [];
  let cursor: string | null = null;
  let generation = 0;
  let inFlight: Promise<Draft[]> | null = null;
  const refresh = (reset = false): Promise<Draft[]> => {
    if (reset) {
      cursor = null;
      generation += 1;
    }
    if (inFlight && !reset) return inFlight;
    const currentGeneration = generation;
    const pending = (async () => {
      let nextCursor = cursor;
      let snapshot = drafts;
      if (nextCursor === null) {
        // Capture the journal boundary before listing so changes during bootstrap are replayed.
        nextCursor = (await listDraftChanges()).nextCursor;
        snapshot = await listDrafts();
      }
      const byId = new Map(snapshot.map((draft) => [draft.id, draft]));
      while (true) {
        const page = await listDraftChanges(nextCursor);
        for (const change of page.changes) {
          if (change.type === "delete") byId.delete(change.draftId);
          else byId.set(change.draft.id, change.draft);
        }
        if (page.hasMore && page.nextCursor === nextCursor)
          throw new Error("Draft cursor did not advance.");
        nextCursor = page.nextCursor;
        if (!page.hasMore) break;
      }
      if (currentGeneration === generation) {
        drafts = [...byId.values()].sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
        );
        cursor = nextCursor;
      }
      return drafts;
    })();
    inFlight = pending;
    const clear = () => {
      if (inFlight === pending) inFlight = null;
    };
    void pending.then(clear, clear);
    return pending;
  };
  return { refresh };
}

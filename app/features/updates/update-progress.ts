export const UPDATE_STARTED_EVENT = "hqbase:update-started";

const storageKey = "hqbase:update-progress";
const progressLifetimeMs = 30 * 60 * 1000;

export type UpdateProgress = {
  buildId: string;
  startedAt: number;
};

export function beginUpdateProgress(buildId: string, now = Date.now()): UpdateProgress {
  const progress = { buildId, startedAt: now };
  storage()?.setItem(storageKey, JSON.stringify(progress));
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<UpdateProgress>(UPDATE_STARTED_EVENT, { detail: progress })
    );
  }
  return progress;
}

export function readUpdateProgress(now = Date.now()): UpdateProgress | null {
  const sessionStorage = storage();
  const serialized = sessionStorage?.getItem(storageKey);
  if (!serialized) return null;

  try {
    const progress = JSON.parse(serialized) as Partial<UpdateProgress>;
    if (
      typeof progress.buildId !== "string" ||
      !progress.buildId ||
      typeof progress.startedAt !== "number" ||
      now - progress.startedAt >= progressLifetimeMs
    ) {
      sessionStorage?.removeItem(storageKey);
      return null;
    }
    return { buildId: progress.buildId, startedAt: progress.startedAt };
  } catch {
    sessionStorage?.removeItem(storageKey);
    return null;
  }
}

export function clearUpdateProgress(): void {
  storage()?.removeItem(storageKey);
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

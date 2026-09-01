import * as React from "react";
import { PWA_UPDATE_READY_EVENT, readPwaUpdateReady } from "@/features/pwa/update-ready";
import { getUpdateStatus } from "./api";
import type { UpdateStatus } from "./types";
import {
  beginUpdateProgress,
  clearUpdateProgress,
  readUpdateProgress,
  type UpdateActionKind,
  type UpdateProgress
} from "./update-progress";

const discoveryIntervalMs = 15 * 60 * 1000;
const activeUpdateIntervalMs = 10_000;

export function useUpdateMonitor(canManage: boolean): {
  acceptStatus: (status: UpdateStatus) => void;
  progress: UpdateProgress | null;
  ready: boolean;
  start: (buildId: string, kind: UpdateActionKind) => void;
  status: UpdateStatus | null;
} {
  const [status, setStatus] = React.useState<UpdateStatus | null>(null);
  const [progress, setProgress] = React.useState<UpdateProgress | null>(() => readUpdateProgress());
  const progressRef = React.useRef(progress);
  const [ready, setReady] = React.useState(readPwaUpdateReady);

  const acceptStatus = React.useCallback((nextStatus: UpdateStatus) => {
    setStatus(nextStatus);
    const updateReachedRepair =
      progressRef.current?.kind === "update" &&
      nextStatus.repairRequired === true &&
      nextStatus.release.version === nextStatus.installedVersion;
    if (!nextStatus.available || updateReachedRepair) {
      clearUpdateProgress();
      progressRef.current = null;
      setProgress(null);
    }
  }, []);

  React.useEffect(() => {
    const handleUpdateReady = (): void => setReady(true);
    window.addEventListener(PWA_UPDATE_READY_EVENT, handleUpdateReady);
    return () => window.removeEventListener(PWA_UPDATE_READY_EVENT, handleUpdateReady);
  }, []);

  React.useEffect(() => {
    if (!canManage) {
      setStatus(null);
      return;
    }

    let active = true;
    let checking = false;
    const check = async (): Promise<void> => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const nextStatus = await getUpdateStatus();
        if (active) acceptStatus(nextStatus);
      } catch {
        // Update discovery must never interrupt mail work.
      } finally {
        checking = false;
      }
    };
    const checkWhenVisible = (): void => {
      if (document.visibilityState === "visible") void check();
    };

    void check();
    const interval = window.setInterval(
      () => void check(),
      progress ? activeUpdateIntervalMs : discoveryIntervalMs
    );
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [acceptStatus, canManage, progress]);

  const start = React.useCallback((buildId: string, kind: UpdateActionKind) => {
    const nextProgress = beginUpdateProgress(buildId, kind);
    progressRef.current = nextProgress;
    setProgress(nextProgress);
  }, []);

  return { acceptStatus, progress, ready, start, status };
}

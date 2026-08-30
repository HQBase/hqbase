import { UPDATE_STARTED_EVENT } from "@/features/updates/update-progress";
import { announcePwaUpdateReady } from "./update-ready";

export type PwaUpdate = {
  activate: () => void;
};

type RegisterPwaOptions = {
  onUpdateReady: (update: PwaUpdate) => void;
  watchForUpdate?: boolean;
};

const UPDATE_INTERVAL_MS = 15 * 60 * 1000;
const ACTIVE_UPDATE_INTERVAL_MS = 10_000;
const ACTIVE_UPDATE_LIFETIME_MS = 30 * 60 * 1000;
const ACTIVATION_FALLBACK_MS = 1_000;

export function registerPwa({
  onUpdateReady,
  watchForUpdate = false
}: RegisterPwaOptions): () => void {
  if (!("serviceWorker" in navigator)) return () => undefined;

  let registration: ServiceWorkerRegistration | undefined;
  let refreshAfterActivation = false;
  let disposed = false;
  let activeUpdateInterval: number | undefined;
  let activeUpdateDeadline = 0;
  let activationFallback: number | undefined;

  const reloadPage = (): void => {
    if (activationFallback !== undefined) window.clearTimeout(activationFallback);
    activationFallback = undefined;
    window.location.reload();
  };

  const activate = (): void => {
    const waiting = registration?.waiting;
    if (!waiting) {
      reloadPage();
      return;
    }
    refreshAfterActivation = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    if (activationFallback !== undefined) window.clearTimeout(activationFallback);
    activationFallback = window.setTimeout(() => {
      if (!refreshAfterActivation) return;
      refreshAfterActivation = false;
      reloadPage();
    }, ACTIVATION_FALLBACK_MS);
  };

  const announceWaitingWorker = (): void => {
    if (registration?.waiting && navigator.serviceWorker.controller) {
      stopActiveUpdateWatch();
      announcePwaUpdateReady();
      onUpdateReady({ activate });
    }
  };

  const checkForUpdate = (): void => {
    if (!registration || !navigator.onLine) return;
    void registration.update().catch(() => {
      // A later focus, online event, or interval will retry without interrupting mail work.
    });
  };

  const startActiveUpdateWatch = (): void => {
    activeUpdateDeadline = Date.now() + ACTIVE_UPDATE_LIFETIME_MS;
    checkForUpdate();
    if (activeUpdateInterval !== undefined) return;
    activeUpdateInterval = window.setInterval(() => {
      if (Date.now() >= activeUpdateDeadline) {
        stopActiveUpdateWatch();
        return;
      }
      checkForUpdate();
    }, ACTIVE_UPDATE_INTERVAL_MS);
  };

  function stopActiveUpdateWatch(): void {
    if (activeUpdateInterval === undefined) return;
    window.clearInterval(activeUpdateInterval);
    activeUpdateInterval = undefined;
  }

  const handleControllerChange = (): void => {
    if (!refreshAfterActivation) return;
    refreshAfterActivation = false;
    reloadPage();
  };

  const handleFocus = (): void => checkForUpdate();
  const handleOnline = (): void => checkForUpdate();
  const handleUpdateStarted = (): void => startActiveUpdateWatch();
  const interval = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);

  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("online", handleOnline);
  window.addEventListener(UPDATE_STARTED_EVENT, handleUpdateStarted);

  void navigator.serviceWorker
    .register("/service-worker.js", { scope: "/", updateViaCache: "none" })
    .then((nextRegistration) => {
      if (disposed) return;
      registration = nextRegistration;
      announceWaitingWorker();
      if (watchForUpdate) startActiveUpdateWatch();
      registration.addEventListener("updatefound", () => {
        const installing = registration?.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") announceWaitingWorker();
        });
      });
    })
    .catch(() => {
      // The application remains usable when registration is unavailable.
    });

  return () => {
    disposed = true;
    window.clearInterval(interval);
    if (activationFallback !== undefined) window.clearTimeout(activationFallback);
    stopActiveUpdateWatch();
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener(UPDATE_STARTED_EVENT, handleUpdateStarted);
  };
}

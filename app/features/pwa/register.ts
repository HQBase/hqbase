export type PwaUpdate = {
  activate: () => void;
};

type RegisterPwaOptions = {
  onUpdateReady: (update: PwaUpdate) => void;
};

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export function registerPwa({ onUpdateReady }: RegisterPwaOptions): () => void {
  if (!("serviceWorker" in navigator)) return () => undefined;

  let registration: ServiceWorkerRegistration | undefined;
  let refreshAfterActivation = false;
  let disposed = false;

  const activate = (): void => {
    if (!registration?.waiting) return;
    refreshAfterActivation = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  };

  const announceWaitingWorker = (): void => {
    if (registration?.waiting && navigator.serviceWorker.controller) {
      onUpdateReady({ activate });
    }
  };

  const checkForUpdate = (): void => {
    if (!registration || !navigator.onLine) return;
    void registration.update().catch(() => {
      // A later focus, online event, or interval will retry without interrupting mail work.
    });
  };

  const handleControllerChange = (): void => {
    if (!refreshAfterActivation) return;
    refreshAfterActivation = false;
    window.location.reload();
  };

  const handleFocus = (): void => checkForUpdate();
  const handleOnline = (): void => checkForUpdate();
  const interval = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);

  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("online", handleOnline);

  void navigator.serviceWorker
    .register("/service-worker.js", { scope: "/", updateViaCache: "none" })
    .then((nextRegistration) => {
      if (disposed) return;
      registration = nextRegistration;
      announceWaitingWorker();
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
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("online", handleOnline);
  };
}

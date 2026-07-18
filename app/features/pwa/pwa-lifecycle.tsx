import * as React from "react";

import { type PwaUpdate, registerPwa } from "./register";

export function PwaLifecycle(): React.ReactElement | null {
  const [online, setOnline] = React.useState(() => navigator.onLine);
  const [update, setUpdate] = React.useState<PwaUpdate | null>(null);

  React.useEffect(() => {
    const handleOnline = (): void => setOnline(true);
    const handleOffline = (): void => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unregisterLifecycle = import.meta.env.PROD
      ? registerPwa({ onUpdateReady: setUpdate })
      : () => undefined;

    return () => {
      unregisterLifecycle();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online && !update) return null;

  return (
    <aside
      aria-live="polite"
      className="fixed right-4 bottom-4 left-4 z-[100] mx-auto flex max-w-xl items-center justify-between gap-4 rounded-lg border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg"
      role="status"
    >
      <span>
        {online
          ? "A new version of HQBase is ready."
          : "You're offline. HQBase will reconnect when your connection returns."}
      </span>
      {online && update ? (
        <button
          className="shrink-0 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={update.activate}
          type="button"
        >
          Reload
        </button>
      ) : null}
    </aside>
  );
}

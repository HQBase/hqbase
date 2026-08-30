import * as React from "react";
import { Button } from "@/components/ui/button";
import { readUpdateProgress } from "@/features/updates/update-progress";
import { playNotificationSound } from "@/lib/notification-sounds";
import { type PwaUpdate, registerPwa } from "./register";

export function PwaLifecycle(): React.ReactElement | null {
  const [online, setOnline] = React.useState(() => navigator.onLine);
  const [update, setUpdate] = React.useState<PwaUpdate | null>(null);
  const updateAnnouncedRef = React.useRef(false);

  React.useEffect(() => {
    const handleOnline = (): void => setOnline(true);
    const handleOffline = (): void => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unregisterLifecycle = import.meta.env.PROD
      ? registerPwa({
          onUpdateReady: (nextUpdate) => {
            if (updateAnnouncedRef.current) return;
            updateAnnouncedRef.current = true;
            setUpdate(nextUpdate);
            playNotificationSound("update-ready");
          },
          watchForUpdate: readUpdateProgress() !== null
        })
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
      className="fixed right-4 bottom-4 left-4 z-[100] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl border border-border bg-popover px-3.5 py-2.5 text-sm text-popover-foreground shadow-[0_14px_38px_rgb(0_0_0/0.32)]"
      role="status"
    >
      <span className={online && update ? "text-xs font-semibold" : undefined}>
        {online
          ? "A new version of HQBase is ready."
          : "You're offline. HQBase will reconnect when your connection returns."}
      </span>
      {online && update ? (
        <Button
          className="shrink-0 rounded-lg px-3.5"
          onClick={update.activate}
          size="sm"
          type="button"
        >
          Reload
        </Button>
      ) : null}
    </aside>
  );
}

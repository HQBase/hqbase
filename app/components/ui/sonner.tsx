import * as React from "react";
import type { ToasterProps } from "sonner";
import { Toaster as Sonner, useSonner } from "sonner";

import { useTheme } from "@/features/theme/theme-provider";
import {
  initializeNotificationSounds,
  notificationSoundForToast,
  playNotificationSound,
  type ToastSoundType
} from "@/lib/notification-sounds";

const playedToastSounds = new Set<string>();
const MAX_PLAYED_TOAST_SOUNDS = 100;

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return (
    <>
      <ToastSounds />
      <Sonner closeButton richColors theme={theme} {...props} />
    </>
  );
}

function ToastSounds(): null {
  const { toasts } = useSonner();

  React.useEffect(() => {
    initializeNotificationSounds();
  }, []);

  React.useEffect(() => {
    for (const item of toasts) {
      const sound = notificationSoundForToast(
        item.id,
        item.type as ToastSoundType | undefined,
        item.delete
      );
      if (!sound) continue;
      const key = `${item.id}:${item.type ?? "normal"}`;
      if (playedToastSounds.has(key)) continue;

      playedToastSounds.add(key);
      playNotificationSound(sound);
    }

    while (playedToastSounds.size > MAX_PLAYED_TOAST_SOUNDS) {
      const oldest = playedToastSounds.values().next().value;
      if (oldest === undefined) break;
      playedToastSounds.delete(oldest);
    }
  }, [toasts]);

  return null;
}

import { tiks } from "@rexa-developer/tiks";

export type NotificationSound =
  | "incoming-email"
  | "outgoing-email"
  | "toast-error"
  | "toast-information"
  | "toast-success"
  | "toast-warning";

export type ToastSoundType =
  | "action"
  | "default"
  | "error"
  | "info"
  | "loading"
  | "normal"
  | "success"
  | "warning";

let initialized = false;

export function notificationSoundForToastType(
  type: ToastSoundType | undefined
): NotificationSound | null {
  if (type === "loading") return null;
  if (type === "success") return "toast-success";
  if (type === "warning") return "toast-warning";
  if (type === "error") return "toast-error";
  return "toast-information";
}

export function notificationSoundForToast(
  id: number | string,
  type: ToastSoundType | undefined,
  deleted = false
): NotificationSound | null {
  if (deleted || String(id).startsWith("outgoing-email:")) return null;
  return notificationSoundForToastType(type);
}

export function initializeNotificationSounds(): void {
  try {
    if (!initialized) {
      tiks.init({
        theme: "soft",
        volume: 0.18,
        respectReducedMotion: true
      });
      initialized = true;
    }
  } catch {
    // Audible feedback must never interrupt application startup.
  }
}

export function playNotificationSound(sound: NotificationSound): void {
  try {
    initializeNotificationSounds();
    if (sound === "incoming-email") {
      tiks.notify();
    } else if (sound === "outgoing-email") {
      tiks.swoosh();
    } else if (sound === "toast-success") {
      tiks.success();
    } else if (sound === "toast-warning") {
      tiks.warning();
    } else if (sound === "toast-error") {
      tiks.error();
    } else {
      tiks.pop();
    }
  } catch {
    // Audible feedback must never interrupt the underlying action.
  }
}

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

const SOUND_VOLUME = 0.55;
const UNLOCK_SOURCE = "/sounds/unlock.wav";
const UNLOCK_EVENTS = ["touchend", "click", "keydown"] as const;
const SOUND_SOURCES: Record<NotificationSound, string> = {
  "incoming-email": "/sounds/incoming-email.wav",
  "outgoing-email": "/sounds/outgoing-email.wav",
  "toast-error": "/sounds/toast-error.wav",
  "toast-information": "/sounds/toast-information.wav",
  "toast-success": "/sounds/toast-success.wav",
  "toast-warning": "/sounds/toast-warning.wav"
};

let initialized = false;
let unlockListenersBound = false;
let player: HTMLAudioElement | null = null;

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
  if (initialized || typeof document === "undefined" || typeof window === "undefined") return;
  initialized = true;
  bindUnlockListeners();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resetPlayer();
  });
  window.addEventListener("pageshow", resetPlayer);
}

export function playNotificationSound(sound: NotificationSound): void {
  try {
    initializeNotificationSounds();
    if (!player || prefersReducedMotion()) return;

    player.pause();
    player.src = SOUND_SOURCES[sound];
    player.currentTime = 0;
    player.volume = SOUND_VOLUME;
    void player.play().catch(() => {
      // The next explicit interaction can unlock playback again.
      bindUnlockListeners();
    });
  } catch {
    // Audible feedback must never interrupt the underlying action.
  }
}

function bindUnlockListeners(): void {
  if (unlockListenersBound || typeof document === "undefined") return;
  unlockListenersBound = true;
  for (const event of UNLOCK_EVENTS) {
    document.addEventListener(event, unlockPlayer, { capture: true, passive: true });
  }
}

function unbindUnlockListeners(): void {
  if (!unlockListenersBound || typeof document === "undefined") return;
  unlockListenersBound = false;
  for (const event of UNLOCK_EVENTS) {
    document.removeEventListener(event, unlockPlayer, true);
  }
}

function unlockPlayer(): void {
  try {
    if (typeof Audio === "undefined") return;
    player ??= new Audio(UNLOCK_SOURCE);
    player.preload = "auto";
    player.src = UNLOCK_SOURCE;
    player.currentTime = 0;

    void player.play().then(
      () => {
        player?.pause();
        if (player) {
          player.currentTime = 0;
          player.volume = SOUND_VOLUME;
        }
        unbindUnlockListeners();
      },
      () => {
        // Keep listeners attached so the next interaction can retry.
      }
    );
  } catch {
    // Keep listeners attached so the next interaction can retry.
  }
}

function resetPlayer(): void {
  try {
    player?.pause();
  } catch {
    // Resetting audio must never interrupt returning to the application.
  }
  player = null;
  bindUnlockListeners();
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type NotificationSound =
  | "incoming-email"
  | "outgoing-email"
  | "refresh-complete"
  | "refresh-pull"
  | "toast-error"
  | "toast-information"
  | "toast-success"
  | "toast-warning"
  | "update-ready";

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
// Prime iPhone audio when a touch begins so a pull-to-refresh cue can use the
// gesture's later touchend without racing a document-level unlock playback.
const UNLOCK_EVENTS = ["touchstart", "click", "keydown"] as const;
const SOUND_SOURCES: Record<NotificationSound, string> = {
  "incoming-email": "/sounds/incoming-email.wav",
  "outgoing-email": "/sounds/outgoing-email.wav",
  "refresh-complete": "/sounds/toast-success.wav",
  "refresh-pull": "/sounds/toast-information.wav",
  "toast-error": "/sounds/toast-error.wav",
  "toast-information": "/sounds/toast-information.wav",
  "toast-success": "/sounds/toast-success.wav",
  "toast-warning": "/sounds/toast-warning.wav",
  "update-ready": "/sounds/update-ready.wav"
};

let initialized = false;
let unlockListenersBound = false;
let player: HTMLAudioElement | null = null;
let playerReady = false;
let playbackGeneration = 0;

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

export function playNotificationSound(sound: NotificationSound): boolean {
  try {
    initializeNotificationSounds();
    if (prefersReducedMotion() || typeof Audio === "undefined") return false;

    player ??= new Audio(SOUND_SOURCES[sound]);
    const playingPlayer = player;
    const playbackWasReady = playerReady;
    const playGeneration = ++playbackGeneration;
    playingPlayer.pause();
    playingPlayer.preload = "auto";
    playingPlayer.src = SOUND_SOURCES[sound];
    playingPlayer.currentTime = 0;
    playingPlayer.volume = SOUND_VOLUME;
    void playingPlayer.play().then(
      () => {
        if (player !== playingPlayer || playbackGeneration !== playGeneration) return;
        playerReady = true;
        unbindUnlockListeners();
      },
      () => {
        if (player !== playingPlayer || playbackGeneration !== playGeneration) return;
        playerReady = false;
        bindUnlockListeners();
      }
    );
    return playbackWasReady;
  } catch {
    // Audible feedback must never interrupt the underlying action.
    return false;
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
    const unlockingPlayer = player;
    const unlockGeneration = ++playbackGeneration;

    void unlockingPlayer.play().then(
      () => {
        if (player !== unlockingPlayer || playbackGeneration !== unlockGeneration) return;
        playerReady = true;
        unlockingPlayer.pause();
        unlockingPlayer.currentTime = 0;
        unlockingPlayer.volume = SOUND_VOLUME;
        unbindUnlockListeners();
      },
      () => {
        if (player !== unlockingPlayer || playbackGeneration !== unlockGeneration) return;
        playerReady = false;
        // Keep listeners attached so the next interaction can retry.
      }
    );
  } catch {
    // Keep listeners attached so the next interaction can retry.
  }
}

function resetPlayer(): void {
  try {
    playbackGeneration += 1;
    player?.pause();
  } catch {
    // Resetting audio must never interrupt returning to the application.
  }
  player = null;
  playerReady = false;
  bindUnlockListeners();
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

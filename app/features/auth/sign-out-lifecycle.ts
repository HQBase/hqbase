export const signOutStartedEvent = "hqbase:sign-out-started";

export function notifySignOutStarted(): void {
  window.dispatchEvent(new Event(signOutStartedEvent));
}

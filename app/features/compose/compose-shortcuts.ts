export type ComposeShortcutEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  repeat: boolean;
  nativeEvent: { isComposing: boolean };
  currentTarget: { requestSubmit: () => void };
  preventDefault: () => void;
};

export function submitComposeOnShortcut(event: ComposeShortcutEvent, sendDisabled: boolean): void {
  const isSendShortcut =
    event.key === "Enter" &&
    (event.metaKey || event.ctrlKey) &&
    !event.repeat &&
    !event.nativeEvent.isComposing;
  if (!isSendShortcut) return;

  event.preventDefault();
  if (!sendDisabled) event.currentTarget.requestSubmit();
}

import { describe, expect, it, vi } from "vitest";

const audioInstances: MockAudio[] = [];

import {
  initializeNotificationSounds,
  notificationSoundForToast,
  notificationSoundForToastType,
  playNotificationSound
} from "@/lib/notification-sounds";

describe("notification sounds", () => {
  it("maps events and plays local audio after an explicit interaction", async () => {
    const documentTarget = Object.assign(new EventTarget(), { visibilityState: "visible" });
    const windowTarget = Object.assign(new EventTarget(), {
      matchMedia: vi.fn(() => ({ matches: false }))
    });
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("Audio", MockAudio);

    expect(notificationSoundForToastType("success")).toBe("toast-success");
    expect(notificationSoundForToastType("warning")).toBe("toast-warning");
    expect(notificationSoundForToastType("error")).toBe("toast-error");
    expect(notificationSoundForToastType("info")).toBe("toast-information");
    expect(notificationSoundForToastType("loading")).toBeNull();
    expect(notificationSoundForToast("outgoing-email:draft-1", "success")).toBeNull();
    expect(notificationSoundForToast(42, "success", true)).toBeNull();

    initializeNotificationSounds();
    initializeNotificationSounds();
    expect(audioInstances).toHaveLength(0);

    documentTarget.dispatchEvent(new Event("touchend"));
    await Promise.resolve();
    expect(audioInstances).toHaveLength(1);
    const audio = audioInstances[0];
    if (!audio) throw new Error("Expected the interaction to create an audio player.");
    expect(audio.src).toBe("/sounds/unlock.wav");
    expect(audio.play).toHaveBeenCalledOnce();

    playNotificationSound("incoming-email");
    expect(audio.src).toBe("/sounds/incoming-email.wav");
    playNotificationSound("outgoing-email");
    expect(audio.src).toBe("/sounds/outgoing-email.wav");
    playNotificationSound("toast-success");
    expect(audio.src).toBe("/sounds/toast-success.wav");
    playNotificationSound("toast-warning");
    expect(audio.src).toBe("/sounds/toast-warning.wav");
    playNotificationSound("toast-error");
    expect(audio.src).toBe("/sounds/toast-error.wav");
    playNotificationSound("toast-information");
    expect(audio.src).toBe("/sounds/toast-information.wav");

    expect(audio.play).toHaveBeenCalledTimes(7);
    expect(audio.volume).toBe(0.55);
  });
});

class MockAudio {
  currentTime = 0;
  pause = vi.fn();
  play = vi.fn(() => Promise.resolve());
  preload = "";
  src: string;
  volume = 1;

  constructor(src = "") {
    this.src = src;
    audioInstances.push(this);
  }
}

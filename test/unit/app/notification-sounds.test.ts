import { describe, expect, it, vi } from "vitest";

const tiks = vi.hoisted(() => ({
  error: vi.fn(),
  init: vi.fn(),
  notify: vi.fn(),
  pop: vi.fn(),
  success: vi.fn(),
  swoosh: vi.fn(),
  warning: vi.fn()
}));

vi.mock("@rexa-developer/tiks", () => ({ tiks }));

import {
  initializeNotificationSounds,
  notificationSoundForToast,
  notificationSoundForToastType,
  playNotificationSound
} from "@/lib/notification-sounds";

describe("notification sounds", () => {
  it("maps mail and toast events to quiet, non-blocking synthesized sounds", () => {
    expect(notificationSoundForToastType("success")).toBe("toast-success");
    expect(notificationSoundForToastType("warning")).toBe("toast-warning");
    expect(notificationSoundForToastType("error")).toBe("toast-error");
    expect(notificationSoundForToastType("info")).toBe("toast-information");
    expect(notificationSoundForToastType("loading")).toBeNull();
    expect(notificationSoundForToast("outgoing-email:draft-1", "success")).toBeNull();
    expect(notificationSoundForToast(42, "success", true)).toBeNull();

    initializeNotificationSounds();
    initializeNotificationSounds();
    playNotificationSound("incoming-email");
    playNotificationSound("outgoing-email");
    playNotificationSound("toast-success");
    playNotificationSound("toast-warning");
    playNotificationSound("toast-error");
    playNotificationSound("toast-information");

    expect(tiks.init).toHaveBeenCalledOnce();
    expect(tiks.init).toHaveBeenCalledWith({
      theme: "soft",
      volume: 0.18,
      respectReducedMotion: true
    });
    expect(tiks.notify).toHaveBeenCalledOnce();
    expect(tiks.swoosh).toHaveBeenCalledOnce();
    expect(tiks.success).toHaveBeenCalledOnce();
    expect(tiks.warning).toHaveBeenCalledOnce();
    expect(tiks.error).toHaveBeenCalledOnce();
    expect(tiks.pop).toHaveBeenCalledOnce();

    tiks.error.mockImplementationOnce(() => {
      throw new Error("Audio unavailable");
    });
    expect(() => playNotificationSound("toast-error")).not.toThrow();
  });
});

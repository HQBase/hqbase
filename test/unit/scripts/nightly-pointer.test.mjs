import { expect, it, vi } from "vitest";
import { waitForNightlyPointer } from "../../../scripts/release/channels.mjs";

const expected = { version: "1.4.1", artifact: { sha256: "a".repeat(64) } };

it("waits for an older valid pointer to advance to the exact candidate", async () => {
  const readManifest = vi
    .fn()
    .mockResolvedValueOnce({ ...expected, version: "1.4.0" })
    .mockResolvedValueOnce(expected);
  const sleep = vi.fn();
  await waitForNightlyPointer(expected, { readManifest, sleep });
  expect(readManifest).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledExactlyOnceWith(2_000);
});

it.each([
  { ...expected, version: "1.4.2" },
  { ...expected, artifact: { sha256: "b".repeat(64) } }
])("rejects a newer or changed candidate without retrying", async (published) => {
  const readManifest = vi.fn().mockResolvedValue(published);
  const sleep = vi.fn();
  await expect(waitForNightlyPointer(expected, { readManifest, sleep })).rejects.toThrow(
    "verification failed"
  );
  expect(readManifest).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

it("does not retry signature or download verification failures", async () => {
  const readManifest = vi.fn().mockRejectedValue(new Error("Invalid signature"));
  const sleep = vi.fn();
  await expect(waitForNightlyPointer(expected, { readManifest, sleep })).rejects.toThrow(
    "Invalid signature"
  );
  expect(readManifest).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

it("fails after bounded retries when the old pointer persists", async () => {
  const readManifest = vi.fn().mockResolvedValue({ ...expected, version: "1.4.0" });
  const sleep = vi.fn();
  await expect(waitForNightlyPointer(expected, { readManifest, sleep })).rejects.toThrow(
    "did not advance"
  );
  expect(readManifest).toHaveBeenCalledTimes(30);
  expect(sleep).toHaveBeenCalledTimes(29);
});

import { describe, expect, it, vi } from "vitest";
import { candidateRelease } from "../../../scripts/release/channels.mjs";

describe("candidate release lookup", () => {
  it.each([
    [true, false],
    [false, true],
    [false, false]
  ])("reads draft=%s and prerelease=%s through the draft-aware CLI", (isDraft, isPrerelease) => {
    const runGh = vi.fn(() => JSON.stringify({ tagName: "v1.4.0", isDraft, isPrerelease }));
    expect(candidateRelease("1.4.0", runGh)).toEqual({ draft: isDraft, prerelease: isPrerelease });
    expect(runGh).toHaveBeenCalledWith([
      "release",
      "view",
      "v1.4.0",
      "--repo",
      "HQBase/hqbase",
      "--json",
      "tagName,isDraft,isPrerelease"
    ]);
  });

  it.each([
    { tagName: "v1.4.1", isDraft: true, isPrerelease: false },
    { tagName: "v1.4.0", isPrerelease: false },
    { tagName: "v1.4.0", isDraft: true }
  ])("rejects a changed or incomplete release identity", (release) => {
    expect(() => candidateRelease("1.4.0", () => JSON.stringify(release))).toThrow(
      "identity is invalid"
    );
  });

  it("propagates a missing release without assuming it is a draft", () => {
    expect(() =>
      candidateRelease("1.4.0", () => {
        throw new Error("release not found");
      })
    ).toThrow("release not found");
  });
});

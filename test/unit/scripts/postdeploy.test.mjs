import { describe, expect, it, vi } from "vitest";
import { printPostDeploy } from "../../../scripts/hqbase/postdeploy.mjs";

describe("HQBase post-deploy output", () => {
  it("prints one concise setup instruction in a visible star box", () => {
    const output = [];
    const log = vi.spyOn(console, "log").mockImplementation((line = "") => output.push(line));

    try {
      printPostDeploy();
    } finally {
      log.mockRestore();
    }

    expect(output.join("\n")).toContain("🎉 HQBase is deployed!");
    expect(output.join("\n")).toContain("Your workspace is almost ready.");
    expect(output.join("\n")).toContain("👉 Open the Worker URL above to finish setting it up.");
    expect(output.join("\n")).not.toMatch(
      /temporary token|permission table|Choose a domain|Email works/
    );
    expect(output[1]).toMatch(/^\*+$/);
    expect(output.at(-2)).toBe(output[1]);
  });
});

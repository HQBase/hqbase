import { describe, expect, it } from "vitest";
import { archiveExtractor } from "../../../scripts/release/deploy.mjs";
import { windowsSystem32Executable } from "../../../scripts/windows-system32.mjs";

describe("Windows system executables", () => {
  it("resolves commands from System32 without using PATH", () => {
    expect(windowsSystem32Executable("whoami.exe", { SystemRoot: "D:\\Windows" })).toBe(
      "D:\\Windows\\System32\\whoami.exe"
    );
    expect(windowsSystem32Executable("icacls.exe", {})).toBe("C:\\Windows\\System32\\icacls.exe");
  });

  it("uses the Windows archive extractor only on Windows", () => {
    expect(
      archiveExtractor({ platform: "win32", environment: { SystemRoot: "D:\\Windows" } })
    ).toBe("D:\\Windows\\System32\\tar.exe");
    expect(archiveExtractor({ platform: "linux" })).toBe("tar");
  });
});

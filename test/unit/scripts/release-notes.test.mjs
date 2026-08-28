import { describe, expect, it } from "vitest";
import { extractReleaseNotes, releaseNoteItems } from "../../../scripts/release/notes.mjs";

describe("release notes", () => {
  const changelog = `# Changelog

## Unreleased

- Future work.

## 1.2.0

### New

- Add the first feature with a wrapped
  description.
- Add the second feature.

### Fixed

- Fix one bug.

## 1.1.0

- Older work.
`;

  it("extracts only the exact release section", () => {
    const notes = extractReleaseNotes(changelog, "1.2.0");
    expect(notes).toContain("### New");
    expect(notes).toContain("Fix one bug");
    expect(notes).not.toContain("Older work");
  });

  it("creates compact signed changelog items", () => {
    expect(releaseNoteItems(extractReleaseNotes(changelog, "1.2.0"))).toEqual([
      "Add the first feature with a wrapped description.",
      "Add the second feature.",
      "Fix one bug."
    ]);
  });

  it("rejects a missing or empty release", () => {
    expect(() => extractReleaseNotes(changelog, "1.3.0")).toThrow("missing release notes");
    expect(() => extractReleaseNotes("## 1.3.0\n\n## 1.2.0\n- Older", "1.3.0")).toThrow(
      "empty release notes"
    );
  });
});

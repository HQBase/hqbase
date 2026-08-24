const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function extractReleaseNotes(changelog, version) {
  if (typeof changelog !== "string") throw new Error("Changelog must be text.");
  if (!VERSION_PATTERN.test(version)) throw new Error("Release version must be semantic.");

  const heading = `## ${version}`;
  const start = changelog.split("\n").findIndex((line) => line.trimEnd() === heading);
  if (start < 0) throw new Error(`CHANGELOG.md is missing release notes for ${version}.`);

  const lines = changelog.split("\n").slice(start + 1);
  const next = lines.findIndex((line) => line.startsWith("## "));
  const notes = lines
    .slice(0, next < 0 ? undefined : next)
    .join("\n")
    .trim();
  if (!notes) throw new Error(`CHANGELOG.md has empty release notes for ${version}.`);
  return notes;
}

export function releaseNoteItems(markdown) {
  const items = [];
  let current = "";

  const finish = () => {
    if (current) items.push(current);
    current = "";
  };

  for (const line of markdown.split("\n")) {
    const item = /^-\s+(.+)$/.exec(line);
    if (item) {
      finish();
      current = item[1].trim();
      continue;
    }
    const continuation = /^\s{2,}(\S.*)$/.exec(line);
    if (current && continuation) {
      current = `${current} ${continuation[1].trim()}`;
      continue;
    }
    if (!line.trim() || line.startsWith("#")) finish();
  }
  finish();

  if (items.length === 0) throw new Error("Release notes must contain at least one list item.");
  if (items.length > 100 || items.some((item) => item.length > 2_000)) {
    throw new Error("Release notes exceed the signed manifest limits.");
  }
  return items;
}

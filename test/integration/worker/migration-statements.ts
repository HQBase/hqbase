export function migrationStatements(source: string): string[] {
  const statements: string[] = [];
  let lines: string[] = [];
  let isTrigger = false;

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (lines.length === 0 && trimmed === "") {
      continue;
    }

    if (lines.length === 0) {
      isTrigger = /^CREATE\s+TRIGGER\b/i.test(trimmed);
    }

    lines.push(line);

    const isComplete = isTrigger ? /^END;\s*$/i.test(trimmed) : /;\s*$/.test(trimmed);
    if (!isComplete) {
      continue;
    }

    statements.push(lines.join("\n").trim().replace(/;\s*$/, ""));
    lines = [];
    isTrigger = false;
  }

  if (lines.join("\n").trim() !== "") {
    throw new Error("Migration contains an incomplete SQL statement.");
  }

  return statements;
}

export function migrationStatements(source: string): string[] {
  const statements: string[] = [];
  let lines: string[] = [];
  let hasSql = false;
  let isTrigger = false;

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!hasSql && trimmed === "") {
      continue;
    }

    if (!hasSql && !trimmed.startsWith("--")) {
      isTrigger = /^CREATE\s+TRIGGER\b/i.test(trimmed);
      hasSql = true;
    }

    lines.push(line);

    const isComplete = isTrigger ? /^END;\s*$/i.test(line) : /;\s*$/.test(trimmed);
    if (!isComplete) {
      continue;
    }

    statements.push(lines.join("\n").trim().replace(/;\s*$/, ""));
    lines = [];
    hasSql = false;
    isTrigger = false;
  }

  if (lines.join("\n").trim() !== "") {
    throw new Error("Migration contains an incomplete SQL statement.");
  }

  return statements;
}

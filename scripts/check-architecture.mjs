import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["app", "worker"];
const hardLimit = 400;
const reviewLimit = 300;
const failures = [];
const warnings = [];

for (const root of roots) {
  for (const file of await sourceFiles(root)) {
    const contents = await readFile(file, "utf8");
    const lineCount = contents.split("\n").length;

    if (lineCount > hardLimit) {
      failures.push(`${file}: ${lineCount} lines exceeds the ${hardLimit}-line limit`);
    } else if (lineCount > reviewLimit) {
      warnings.push(`${file}: ${lineCount} lines should be reviewed for splitting`);
    }

    if (file.startsWith(`worker${path.sep}`) && /from\s+["']@\//.test(contents)) {
      failures.push(`${file}: Worker code must not import frontend modules`);
    }
    if (file.startsWith(`app${path.sep}`) && /from\s+["']@worker\//.test(contents)) {
      failures.push(`${file}: frontend code must not import Worker modules`);
    }
    if (file.startsWith(`worker${path.sep}`) && /from\s+["']node:/.test(contents)) {
      failures.push(`${file}: Worker code must prefer Web Platform APIs over Node built-ins`);
    }
  }
}

for (const warning of warnings) console.warn(`warning: ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`error: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Architecture check passed${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.`
  );
}

async function sourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const location = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(location)));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(location);
  }
  return files;
}

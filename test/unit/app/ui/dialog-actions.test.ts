import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = new URL("../../../../app/", import.meta.url);

function listTsxFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name, directory);
    return entry.isDirectory()
      ? listTsxFiles(new URL(`${child.href}/`))
      : entry.name.endsWith(".tsx")
        ? [child]
        : [];
  });
}

describe("dialog actions", () => {
  it("uses the shared default action height in every dialog footer", () => {
    const footerBlocks = listTsxFiles(appRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(/<DialogFooter\b[^>]*>([\s\S]*?)<\/DialogFooter>/g)].map(
        (match) => ({
          file: join(...file.pathname.split("/").slice(-4)),
          source: match[1] ?? ""
        })
      );
    });
    const customSizedActions = footerBlocks.filter(({ source }) =>
      /<Button\b[^>]*\bsize=/.test(source)
    );

    expect(footerBlocks.length).toBeGreaterThanOrEqual(27);
    expect(customSizedActions).toEqual([]);
  });
});

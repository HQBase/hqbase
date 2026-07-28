import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../../app/components/ui/select.tsx", import.meta.url),
  "utf8"
);

describe("select", () => {
  it("layers its portaled options above fixed dialogs", () => {
    expect(source).toContain("relative z-[60]");
    expect(source).toContain("className={cn(selectContentClasses, className)}");
  });

  it("uses restrained Lucide indicators", () => {
    expect(source).toContain('className="size-3.5 shrink-0 text-muted-foreground"');
    expect(source.match(/strokeWidth=\{1\.5\}/g)).toHaveLength(2);
  });
});

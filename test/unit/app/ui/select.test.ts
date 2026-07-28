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
});

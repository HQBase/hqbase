import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../../app/components/ui/dropdown-menu.tsx", import.meta.url),
  "utf8"
);

describe("dropdown menu", () => {
  it("layers its portaled content above floating composer windows", () => {
    expect(source).toContain("relative z-[2147483647]");
  });
});

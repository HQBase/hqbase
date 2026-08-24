import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("button", () => {
  it("uses a true 36 pixel small size", () => {
    const html = renderToStaticMarkup(<Button size="sm">Small action</Button>);

    expect(html).toContain("h-9 min-h-9");
    expect(html).not.toContain("h-10 min-h-10");
  });
});

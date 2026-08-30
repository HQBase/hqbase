import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("button", () => {
  it("uses a 25 percent shorter small size", () => {
    const html = renderToStaticMarkup(<Button size="sm">Small action</Button>);

    expect(html).toContain("h-[27px] min-h-[27px]");
    expect(html).not.toContain("h-9 min-h-9");
  });

  it("does not move when it is pressed", () => {
    const html = renderToStaticMarkup(<Button>Action</Button>);

    expect(html).not.toContain("active:scale");
    expect(html).not.toContain("will-change-transform");
  });

  it("uses a thin focus outline without a glow", () => {
    const html = renderToStaticMarkup(<Button>Action</Button>);

    expect(html).toContain("focus-visible:outline-1");
    expect(html).not.toContain("focus-visible:ring");
  });

  it("uses the compact field-and-action height by default", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);

    expect(html).toContain("h-[30px] min-h-[30px]");
  });
});

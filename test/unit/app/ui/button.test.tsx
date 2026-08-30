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

  it("matches actions to adjacent field heights", () => {
    const textAction = renderToStaticMarkup(<Button size="field">Save</Button>);
    const iconAction = renderToStaticMarkup(<Button size="fieldIcon">Copy</Button>);

    expect(textAction).toContain("h-[38px] min-h-[38px]");
    expect(iconAction).toContain("size-[38px] min-h-[38px] min-w-[38px]");
  });
});

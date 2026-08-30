import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";

describe("input radius", () => {
  it.each([
    <Input key="input" />,
    <Textarea key="textarea" />
  ])("matches the grouped search input", (field) => {
    expect(renderToStaticMarkup(field)).toContain("rounded-[calc(var(--radius)+2px)]");
  });

  it("uses the compact shared single-line field height", () => {
    expect(renderToStaticMarkup(<Input />)).toContain("h-[38px]");
    expect(
      renderToStaticMarkup(
        <InputGroup>
          <InputGroupInput />
        </InputGroup>
      )
    ).toContain("h-[38px]");
  });
});

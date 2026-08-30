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

  it("changes only the border when a field receives focus", () => {
    const input = renderToStaticMarkup(<Input />);
    const textarea = renderToStaticMarkup(<Textarea />);
    const group = renderToStaticMarkup(
      <InputGroup>
        <InputGroupInput />
      </InputGroup>
    );

    expect(input).toContain("focus-visible:border-ring");
    expect(input).toContain("focus-visible:shadow-none");
    expect(input).not.toContain("focus-visible:ring");
    expect(textarea).toContain("focus-visible:border-ring");
    expect(textarea).not.toContain("focus-visible:ring");
    expect(group).toContain("focus-within:border-ring");
    expect(group).not.toContain("focus-within:ring");
  });
});

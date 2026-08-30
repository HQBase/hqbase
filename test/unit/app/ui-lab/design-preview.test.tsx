import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "@/features/theme/theme-provider";
import { DesignPreview } from "@/features/ui-lab/design-preview";

describe("design UI lab", () => {
  it("renders the complete visual inventory without product data", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider initialTheme="light">
        <DesignPreview />
      </ThemeProvider>
    );

    expect(html).toContain("Design UI lab");
    expect(html).toContain("24 primitives");
    expect(html).toContain("Development fixtures only. No APIs or customer data.");
    expect(html).toContain("Foundations");
    expect(html).toContain("Open dialog");
    expect(html).toContain("Product patterns");
    expect(html).toContain("Screen route index");
  });
});

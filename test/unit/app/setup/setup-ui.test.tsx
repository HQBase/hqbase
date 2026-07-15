import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccessStep } from "@/features/setup/setup-access-screen";

describe("setup UI", () => {
  it("uses a direct step title without eyebrow copy", () => {
    const html = renderToStaticMarkup(
      <AccessStep error={null} isLoading={false} onNext={() => undefined} />
    );

    expect(html).toContain("Verifying installation");
    expect(html).not.toContain("Continue with Cloudflare");
    expect(html).not.toContain(">Cloudflare</p>");
    expect(html).not.toContain("uppercase tracking");
  });
});

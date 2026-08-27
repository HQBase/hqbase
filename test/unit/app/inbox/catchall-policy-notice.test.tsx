import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CatchAllPolicyNotice } from "@/features/inbox/catch-all-policy-notice";

describe("catch-all policy notice", () => {
  it("explains the compatibility view and links to domain settings", () => {
    const html = renderToStaticMarkup(<CatchAllPolicyNotice />);

    expect(html).toContain("owner-only view keeps unassigned mail");
    expect(html).toContain('href="/settings/domains"');
    expect(html).toContain("Changes do not move mail that is already here");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { CloudflareAuthorizationDialogBody } from "@/features/settings/cloudflare-authorization-dialog";

describe("Cloudflare authorization dialog", () => {
  it("explains the handoff and keeps authorization inside the modal", () => {
    const html = renderToStaticMarkup(
      <Dialog>
        <CloudflareAuthorizationDialogBody
          authorizeHref="/api/pro/domains/cloudflare/oauth/start"
          description="To save this change, HQBase needs temporary access to your Cloudflare account."
        />
      </Dialog>
    );

    expect(html).toContain("Authorize Cloudflare");
    expect(html).toContain("To save this change");
    expect(html).toContain("Cancel");
    expect(html).toContain('href="/api/pro/domains/cloudflare/oauth/start"');
  });
});

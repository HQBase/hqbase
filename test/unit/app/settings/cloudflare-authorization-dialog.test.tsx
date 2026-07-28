import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import {
  CloudflareAuthorizationDialogBody,
  CloudflareReauthenticationForm
} from "@/features/settings/cloudflare-authorization-dialog";

describe("Cloudflare authorization dialog", () => {
  it("explains the handoff and keeps authorization inside the modal", () => {
    const html = renderToStaticMarkup(
      <Dialog>
        <CloudflareAuthorizationDialogBody
          authorizeHref="/api/domains/cloudflare/oauth/start"
          description="To save this change, HQBase needs temporary access to your Cloudflare account."
        />
      </Dialog>
    );

    expect(html).toContain("Authorize Cloudflare");
    expect(html).toContain("To save this change");
    expect(html).toContain("Cancel");
    expect(html).toContain('href="/api/domains/cloudflare/oauth/start"');
  });

  it("keeps stale-session confirmation inside the modal", () => {
    const html = renderToStaticMarkup(
      <Dialog>
        <CloudflareReauthenticationForm
          description="To install this update, HQBase needs temporary access to your Cloudflare account."
          error={null}
          layout="dialog"
          password=""
          pending={false}
          onPasswordChange={() => undefined}
          onSubmit={() => undefined}
        />
      </Dialog>
    );

    expect(html).toContain("Sign in again");
    expect(html).toContain("Password");
    expect(html).toContain("Sign in and continue");
    expect(html).not.toContain("/api/updates/cloudflare/oauth/start");
  });
});

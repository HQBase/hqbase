import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DeviceAuthorizationReview } from "@/features/auth/device-authorization-view";

describe("device authorization review", () => {
  it("shows the exact code, identity, resource, permissions, and explicit decisions", () => {
    const html = renderToStaticMarkup(
      <DeviceAuthorizationReview
        clientName="Mailbox Agent"
        error={null}
        identity="Owner (owner@example.com)"
        onAllow={() => undefined}
        onDeny={() => undefined}
        pending={null}
        resource="https://mail.example.com/api/v2"
        scopes={["mail:read", "mail:send"]}
        userCode="ABCD-EFGH"
        verified
      />
    );

    expect(html).toContain("Connect Mailbox Agent");
    expect(html).toContain("ABCD-EFGH");
    expect(html).toContain("owner@example.com");
    expect(html).toContain("https://mail.example.com/api/v2");
    expect(html).toContain("Read allowed mailboxes");
    expect(html).toContain("Manage drafts and attachments");
    expect(html).toContain(">Deny<");
    expect(html).toContain(">Allow<");
    expect(html).toContain("never your password or browser session");
  });
});

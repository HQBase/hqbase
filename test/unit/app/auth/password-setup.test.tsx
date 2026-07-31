import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InvitationPasswordSetupPage,
  TemporaryPasswordSetupPage
} from "@/features/auth/password-setup-page";

describe("password setup presentation", () => {
  it("asks an invited user to create a password from a valid token", () => {
    const html = renderToStaticMarkup(
      <InvitationPasswordSetupPage error={null} token="setup-token" />
    );

    expect(html).toContain("Set up your password");
    expect(html).toContain("Login email");
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain("Create password");
    expect(html).not.toContain("Temporary password");
  });

  it("explains expired invitation recovery without rendering password inputs", () => {
    const html = renderToStaticMarkup(
      <InvitationPasswordSetupPage error="INVALID_TOKEN" token={null} />
    );

    expect(html).toContain("Invitation link unavailable");
    expect(html).toContain("resend the invitation");
    expect(html).not.toContain('type="password"');
  });

  it("blocks a directly created user on the password replacement screen", () => {
    const html = renderToStaticMarkup(
      <TemporaryPasswordSetupPage
        user={{
          defaultFromMailboxId: null,
          email: "person@gmail.com",
          id: "user-1",
          name: "Avery",
          passwordSetupRequired: true,
          role: "member"
        }}
        onComplete={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain("Create your password");
    expect(html).toContain("person@gmail.com");
    expect(html).toContain("Temporary password");
    expect(html).toContain("Save password");
  });
});

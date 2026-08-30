import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ForgotPasswordPage,
  InvitationPasswordSetupPage,
  PasswordResetPage,
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

  it("asks for a Login email without revealing whether an account exists", () => {
    const html = renderToStaticMarkup(<ForgotPasswordPage returnTo="/" />);

    expect(html).toContain("Forgot your password?");
    expect(html).toContain("Login email");
    expect(html).toContain("if the account exists");
    expect(html).toContain("Send reset link");
    expect(html).toContain(
      '<a class="underline-offset-4 transition-colors hover:text-foreground hover:underline" href="https://hqbase.io/" rel="noopener" target="_blank">Powered by HQBase</a>'
    );
  });

  it("uses recovery-specific copy for a valid reset token", () => {
    const html = renderToStaticMarkup(
      <PasswordResetPage error={null} returnTo="/device?user_code=ABCD-EFGH" token="reset-token" />
    );

    expect(html).toContain("Reset your password");
    expect(html).toContain("Reset password");
    expect(html).toContain('maxLength="128"');
    expect(html).not.toContain("Invitation accepted");
  });

  it("offers a new request for an invalid reset link", () => {
    const html = renderToStaticMarkup(
      <PasswordResetPage error="INVALID_TOKEN" returnTo="/" token={null} />
    );

    expect(html).toContain("Reset link unavailable");
    expect(html).toContain("Request a new link");
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

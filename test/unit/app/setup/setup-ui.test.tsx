import { Globe2, Inbox, UserRound } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccessStep } from "@/features/setup/setup-access-screen";
import { SetupFrame } from "@/features/setup/setup-frame";
import { WizardLayout } from "@/features/setup/setup-wizard-parts";
import { MailboxStep, OwnerStep } from "@/features/setup/setup-workspace-screens";

describe("setup UI", () => {
  it("shows Cloudflare verification as an inline loading state", () => {
    const html = renderToStaticMarkup(
      <AccessStep error={null} isLoading onNext={() => undefined} />
    );

    expect(html).toContain("Checking Cloudflare access to set up the workspace…");
    expect(html).toContain("animate-spin");
    expect(html).not.toContain("Temporary delegated access");
    expect(html).not.toContain("revoke the grant");
  });

  it("shows Cloudflare verification errors without a nested alert card", () => {
    const html = renderToStaticMarkup(
      <AccessStep
        error="The delegated Cloudflare grant expired before setup finished."
        isLoading={false}
        onNext={() => undefined}
      />
    );

    expect(html).not.toContain("Installation access needs attention");
    expect(html).toContain("The delegated Cloudflare grant expired before setup finished.");
    expect(html).toContain("Authorize Cloudflare");
    expect(html).not.toContain("relative w-full rounded-lg border");
  });

  it("uses an installation timeline until Cloudflare access is ready", () => {
    const html = renderToStaticMarkup(
      <SetupFrame description="Complete installation." title="Set up HQBase">
        <WizardLayout activePhase={2} activeStep={0} steps={[]}>
          <AccessStep error={null} isLoading onNext={() => undefined} />
        </WizardLayout>
      </SetupFrame>
    );

    expect(html).toContain('aria-label="Installation steps"');
    expect(html).toContain("Deploy HQBase resources");
    expect(html).toContain("Worker and customer-owned storage");
    expect(html).toContain("Complete");
    expect(html).toContain("Authorize and install");
    expect(html).toContain("In progress");
    expect(html).toContain("Checking Cloudflare access to set up the workspace…");
    expect(html).not.toContain('aria-label="Workspace configuration steps"');
  });

  it("ends setup in the third step without a separate ready step", () => {
    const html = renderToStaticMarkup(
      <SetupFrame description="Configure the workspace." title="Configure workspace">
        <WizardLayout
          activePhase={3}
          activeStep={3}
          steps={[
            { icon: Globe2, title: "Domain" },
            { icon: UserRound, title: "Owner account" },
            { icon: Inbox, title: "Mailboxes" }
          ]}
        >
          <p>Complete setup</p>
        </WizardLayout>
      </SetupFrame>
    );

    expect(html).toContain("Configure workspace");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Domain: complete"');
    expect(html).toContain('aria-label="Mailboxes: active"');
    expect(html).not.toContain("<header");
    expect(html).not.toContain(">HQBase</span>");
    expect(html).toContain("Configure workspace");
    expect(html).toContain("Domain");
    expect(html).toContain("Owner account");
    expect(html).toContain("Mailboxes");
    expect(html).toContain("Complete setup");
    expect(html).not.toContain(">Ready<");
    expect(html).toContain('aria-label="Workspace configuration steps"');
    expect(html).not.toContain('aria-label="Installation steps"');
    expect(html).not.toContain("Authorize and install");
  });

  it("labels the owner identity as Login email and explains independent access", () => {
    const html = renderToStaticMarkup(
      <OwnerStep
        errors={{}}
        ownerEmail="owner@gmail.com"
        ownerName="Workspace Owner"
        ownerPassword="a-secure-password"
        onBack={() => undefined}
        onNext={() => undefined}
        setOwnerEmail={() => undefined}
        setOwnerName={() => undefined}
        setOwnerPassword={() => undefined}
      />
    );

    expect(html).toContain("Login email");
    expect(html).toContain("always access, even when HQBase is unavailable");
    expect(html).toContain("cannot use a domain connected to this workspace");
    expect(html).not.toContain("external");
  });

  it("shows mailboxes in one compact editable table", () => {
    const mailboxes = [
      { address: "support@northstar.example", displayName: "Support" },
      { address: "privacy@northstar.example", displayName: "Privacy" },
      { address: "support@fieldnotes.example", displayName: "Support" },
      { address: "privacy@fieldnotes.example", displayName: "Privacy" }
    ];
    const html = renderToStaticMarkup(
      <MailboxStep
        defaultFromMailboxAddress="privacy@northstar.example"
        errors={{ rows: mailboxes.map(() => ({})) }}
        isPending={false}
        mailboxes={mailboxes}
        onAdd={() => undefined}
        onBack={() => undefined}
        onComplete={() => undefined}
        onRemove={() => undefined}
        onSetDefaultFromMailboxAddress={() => undefined}
        onUpdate={() => undefined}
        submitError={null}
      />
    );

    expect(html).toContain('aria-label="Mailboxes"');
    expect(html).toContain("<table");
    expect(html).toContain("support@northstar.example");
    expect(html).toContain("privacy@fieldnotes.example");
    expect(html).toContain("Add mailbox");
    expect(html).toContain("Default From mailbox");
    expect(html).toContain("Replies use the mailbox that received");
    expect(html).not.toContain("Add shared addresses");
    expect(html).not.toContain(">Review<");
    expect(html).not.toContain(">Mailbox 1<");
  });
});

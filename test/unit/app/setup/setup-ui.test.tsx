import { Globe2, Inbox, UserRound } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccessStep } from "@/features/setup/setup-access-screen";
import { DomainStep } from "@/features/setup/setup-domain-screen";
import { WizardLayout } from "@/features/setup/setup-wizard-parts";
import { MailboxStep, OwnerStep } from "@/features/setup/setup-workspace-screens";

const steps = [
  { icon: Globe2, title: "Domain" },
  { icon: UserRound, title: "Owner account" },
  { icon: Inbox, title: "Mailboxes" }
];

describe("setup UI", () => {
  it("presents Cloudflare authorization as the primary access action", () => {
    const html = renderToStaticMarkup(
      <AccessStep
        apiToken=""
        error={null}
        isLoading={false}
        onApiTokenChange={() => undefined}
        onNext={() => undefined}
      />
    );

    expect(html).toContain('href="/api/setup/cloudflare/oauth/start"');
    expect(html).toContain("Authorize Cloudflare");
    expect(html).toContain("Use an API token instead");
    expect(html).not.toContain("rounded-lg border bg-card");
  });

  it("uses the compact installation timeline until access is ready", () => {
    const html = renderToStaticMarkup(
      <WizardLayout accessReady={false} activeStep={0} steps={steps}>
        <p>Authorize action</p>
      </WizardLayout>
    );

    expect(html).toContain('aria-label="Installation steps"');
    expect(html).toContain("Deploy resources");
    expect(html).toContain("Authorize Cloudflare");
    expect(html).toContain("Authorize action");
    expect(html).not.toContain("Ready");
  });

  it("replaces installation with a three-step workspace progress indicator", () => {
    const html = renderToStaticMarkup(
      <WizardLayout accessReady activeStep={2} steps={steps}>
        <p>Owner form</p>
      </WizardLayout>
    );

    expect(html).toContain('aria-label="Workspace configuration steps"');
    expect(html).toContain('aria-label="Domain: complete"');
    expect(html).toContain('aria-label="Owner account: active"');
    expect(html).toContain('aria-label="Mailboxes: upcoming"');
    expect(html).not.toContain("Deploy resources");
  });

  it("does not offer a Pro upgrade before Community setup is complete", () => {
    const zones = [
      {
        id: "zone-1",
        name: "example.com",
        status: "active",
        type: "full",
        accountId: "account-1",
        accountName: "Example"
      },
      {
        id: "zone-2",
        name: "example.net",
        status: "active",
        type: "full",
        accountId: "account-1",
        accountName: "Example"
      }
    ];
    const html = renderToStaticMarkup(
      <DomainStep
        appHostname="hqbase.example.com"
        appSubdomain="hqbase"
        connectionError={null}
        errors={{}}
        isLoading={false}
        onBack={null}
        onConnect={() => undefined}
        onSelect={() => undefined}
        result={null}
        selectedZone={zones[0] ?? null}
        selectedZoneId="zone-1"
        setAppSubdomain={() => undefined}
        zones={zones}
      />
    );

    expect(html).toContain("Connect domain");
    expect(html).not.toContain("Upgrade to Pro");
    expect(html).not.toContain("Upgrade this workspace to Pro");
  });

  it("keeps owner validation beside labels and offers password reveal", () => {
    const html = renderToStaticMarkup(
      <OwnerStep
        errors={{ email: "Enter a valid login email." }}
        ownerEmail="bad"
        ownerName="Jane Smith"
        ownerPassword="password"
        setOwnerEmail={() => undefined}
        setOwnerName={() => undefined}
        setOwnerPassword={() => undefined}
        onBack={() => undefined}
        onNext={() => undefined}
      />
    );

    expect(html).toContain("Login email");
    expect(html).toContain("Enter a valid login email.");
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain("This address is for authentication, not mailbox routing.");
  });

  it("renders shared addresses as one compact editable table", () => {
    const html = renderToStaticMarkup(
      <MailboxStep
        createOwnerMailbox={false}
        errors={{ rows: [{}, {}] }}
        isPending={false}
        mailboxes={[
          { address: "support@example.com", displayName: "Support" },
          { address: "privacy@example.com", displayName: "Privacy" }
        ]}
        ownerMailboxDraft={{ address: "owner@example.com", displayName: "Jane Smith" }}
        submitError={null}
        onAdd={() => undefined}
        onBack={() => undefined}
        onComplete={() => undefined}
        onRemove={() => undefined}
        onSetCreateOwnerMailbox={() => undefined}
        onUpdate={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Mailboxes"');
    expect(html).toContain("support@example.com");
    expect(html).toContain("privacy@example.com");
    expect(html).toContain("Complete setup");
    expect(html).not.toContain("Review");
    expect(html).not.toContain("Mailbox 1</");
  });
});

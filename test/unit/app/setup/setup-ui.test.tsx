import { Cloud, Globe2 } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccessStep } from "@/features/setup/setup-access-screen";
import { WizardLayout } from "@/features/setup/setup-wizard-parts";
import {
  ACCESS_STEP,
  DOMAIN_STEP,
  isWizardStepComplete,
  MAILBOX_STEP
} from "@/features/setup/use-setup-flow";

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

    expect(html).toContain('<h2 id="setup-step-title"');
    expect(html).toContain('<h3 id="one-time-authorization"');
    expect(html).toContain('href="/api/setup/cloudflare/oauth/start"');
    expect(html).not.toContain("<form");
    expect(html).toContain("Authorize Cloudflare");
    expect(html).toContain("h-8 rounded-md px-3 text-xs");
    expect(html).toContain('aria-labelledby="setup-step-title" class="w-full"');
    expect(html).toContain("max-w-2xl text-sm leading-6 text-muted-foreground");
    expect(html).toContain("<details");
    expect(html).toContain("Use an API token instead");
    expect(html).not.toContain(">Cloudflare</p>");
  });

  it("renders the accessible accordion onboarding shell", () => {
    const html = renderToStaticMarkup(
      <WizardLayout
        activeStep={1}
        onStepSelect={() => undefined}
        steps={[
          {
            canOpen: true,
            description: "Access verified",
            icon: Cloud,
            id: "access",
            isComplete: true,
            title: "Cloudflare access"
          },
          {
            canOpen: true,
            description: "Choose a domain",
            icon: Globe2,
            id: "domain",
            isComplete: false,
            title: "Domain"
          }
        ]}
      >
        <p>Current step</p>
      </WizardLayout>
    );

    expect(html).toContain('aria-label="Setup progress"');
    expect(html).toContain("Requirements");
    expect(html).toContain("Deploy resources");
    expect(html).toContain("Configure workspace");
    expect(html).toContain("data-radix-collection-item");
    expect(html).toContain("Current step");
  });

  it("marks only ready steps that the user has actually completed", () => {
    expect(isWizardStepComplete(ACCESS_STEP, DOMAIN_STEP, true)).toBe(true);
    expect(isWizardStepComplete(DOMAIN_STEP, DOMAIN_STEP, true)).toBe(false);
    expect(isWizardStepComplete(MAILBOX_STEP, DOMAIN_STEP, true)).toBe(false);
  });
});

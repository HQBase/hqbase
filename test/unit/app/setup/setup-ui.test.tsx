import { Cloud, Globe2 } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccessStep } from "@/features/setup/setup-access-screen";
import { WizardLayout } from "@/features/setup/setup-wizard-parts";

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
    expect(html).toContain('action="/api/setup/cloudflare/oauth/start"');
    expect(html).toContain('method="get"');
    expect(html).toContain("Authorize Cloudflare");
    expect(html).toContain("<details");
    expect(html).toContain("Use an API token instead");
    expect(html).not.toContain(">Cloudflare</p>");
  });

  it("renders an accessible connected progress rail", () => {
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
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("after:bg-foreground/55");
    expect(html).toContain("Current step");
  });
});

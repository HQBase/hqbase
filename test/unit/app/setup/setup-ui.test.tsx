import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccessStep } from "@/features/setup/setup-access-screen";
import { SetupFrame } from "@/features/setup/setup-frame";
import { WizardLayout } from "@/features/setup/setup-wizard-parts";

describe("setup UI", () => {
  it("uses a direct step title without eyebrow copy", () => {
    const html = renderToStaticMarkup(
      <AccessStep error={null} isLoading={false} onNext={() => undefined} />
    );

    expect(html).toContain("Verifying installation");
    expect(html).not.toContain("Continue with Cloudflare");
    expect(html).not.toContain(">Cloudflare</p>");
    expect(html).not.toContain("uppercase tracking");
  });

  it("uses the shared product frame and exposes a reviewable completed state", () => {
    const html = renderToStaticMarkup(
      <SetupFrame description="Configure the workspace." progress="4 / 4" title="HQBase Pro setup">
        <WizardLayout activeStep={3} isComplete onStepSelect={() => undefined} steps={[]}>
          <p>Open workspace</p>
        </WizardLayout>
      </SetupFrame>
    );

    expect(html).toContain("HQBase Pro setup");
    expect(html).toContain("4 / 4");
    expect(html).toContain('aria-label="Setup progress"');
    expect(html).toContain("Purchase Pro");
    expect(html).toContain("Deploy resources");
    expect(html).toContain("Authorize and install");
    expect(html).toContain("Configure workspace");
    expect(html).toContain("Open workspace");
  });
});

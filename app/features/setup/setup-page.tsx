import type * as React from "react";

import { AccessStep } from "./setup-access-screen";
import { DomainStep } from "./setup-domain-screen";
import { SetupFrame } from "./setup-frame";
import { WizardLayout } from "./setup-wizard-parts";
import { MailboxStep, OwnerStep } from "./setup-workspace-screens";
import { ACCESS_STEP, DOMAIN_STEP, MAILBOX_STEP, OWNER_STEP, useSetupFlow } from "./use-setup-flow";

export function SetupPage({ onComplete }: { onComplete: () => void }): React.ReactElement {
  const flow = useSetupFlow(onComplete);

  return (
    <SetupFrame
      description="Community onboarding resumes from the last completed setup step."
      progress={`${flow.activeStep === ACCESS_STEP ? 3 : 4} / 5`}
      title="Set up HQBase"
    >
      <WizardLayout
        activeStep={flow.activeStep}
        steps={flow.steps}
        onStepSelect={flow.onStepSelect}
      >
        {flow.activeStep === ACCESS_STEP ? <AccessStep {...flow.access} /> : null}
        {flow.activeStep === DOMAIN_STEP ? <DomainStep {...flow.domain} /> : null}
        {flow.activeStep === OWNER_STEP ? <OwnerStep {...flow.owner} /> : null}
        {flow.activeStep === MAILBOX_STEP ? <MailboxStep {...flow.mailboxes} /> : null}
      </WizardLayout>
    </SetupFrame>
  );
}

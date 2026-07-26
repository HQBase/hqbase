import type * as React from "react";

import { AccessStep } from "./setup-access-screen";
import { DomainStep } from "./setup-domain-screen";
import { SetupFrame } from "./setup-frame";
import { ACCESS_STEP, DOMAIN_STEP, MAILBOX_STEP, OWNER_STEP } from "./setup-steps";
import { WizardLayout } from "./setup-wizard-parts";
import { MailboxStep, OwnerStep } from "./setup-workspace-screens";
import { useSetupFlow } from "./use-setup-flow";

export function SetupPage({ onComplete }: { onComplete: () => void }): React.ReactElement {
  const flow = useSetupFlow(onComplete);
  const activePhase = flow.activeStep === ACCESS_STEP ? 2 : 3;

  return (
    <SetupFrame
      description={
        activePhase === 3
          ? "Add your domain, owner account, and shared addresses."
          : "Complete installation before configuring your workspace."
      }
      title={activePhase === 3 ? "Configure workspace" : "Set up HQBase"}
    >
      <WizardLayout activePhase={activePhase} activeStep={flow.activeStep} steps={flow.steps}>
        {flow.activeStep === ACCESS_STEP ? <AccessStep {...flow.access} /> : null}
        {flow.activeStep === DOMAIN_STEP ? <DomainStep {...flow.domain} /> : null}
        {flow.activeStep === OWNER_STEP ? <OwnerStep {...flow.owner} /> : null}
        {flow.activeStep === MAILBOX_STEP ? <MailboxStep {...flow.mailboxes} /> : null}
      </WizardLayout>
    </SetupFrame>
  );
}

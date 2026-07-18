import type * as React from "react";

import { AccessStep } from "./setup-access-screen";
import { DomainStep } from "./setup-domain-screen";
import { SetupFrame } from "./setup-frame";
import { WizardLayout } from "./setup-wizard-parts";
import { MailboxStep, OwnerStep } from "./setup-workspace-screens";
import { useSetupFlow } from "./use-setup-flow";

export function SetupPage({ onComplete }: { onComplete: () => void }): React.ReactElement {
  const flow = useSetupFlow(onComplete);
  const screens = [
    <AccessStep key="access" {...flow.access} />,
    <DomainStep key="domain" {...flow.domain} />,
    <OwnerStep key="owner" {...flow.owner} />,
    <MailboxStep key="mailboxes" {...flow.mailboxes} />
  ];
  const screen = flow.accessReady ? screens[flow.activeStep] : screens[0];

  return (
    <SetupFrame
      description={
        flow.accessReady
          ? "Add your domain, owner account, and mailboxes."
          : "Complete installation before configuring your workspace."
      }
      title={flow.accessReady ? "Configure workspace" : "Set up HQBase Community"}
    >
      <WizardLayout
        accessFailed={flow.accessFailed}
        accessReady={flow.accessReady}
        activeStep={flow.activeStep}
        steps={flow.steps}
      >
        {screen}
      </WizardLayout>
    </SetupFrame>
  );
}

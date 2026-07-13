import type * as React from "react";

import { AccessStep } from "./setup-access-screen";
import { DomainStep } from "./setup-domain-screen";
import { WizardLayout } from "./setup-wizard-parts";
import { MailboxStep, OwnerStep } from "./setup-workspace-screens";
import { ACCESS_STEP, DOMAIN_STEP, MAILBOX_STEP, OWNER_STEP, useSetupFlow } from "./use-setup-flow";

export function SetupPage({ onComplete }: { onComplete: () => void }): React.ReactElement {
  const flow = useSetupFlow(onComplete);

  return (
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-md border bg-card font-mono text-[10px] font-semibold">
              HQ
            </span>
            <span className="text-sm font-medium">HQBase</span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {flow.activeStep + 1} / {flow.steps.length}
          </span>
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Set up HQBase</h1>
          <p className="text-sm text-muted-foreground">
            A self-hosted workspace in your Cloudflare account.
          </p>
        </div>

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
      </div>
    </main>
  );
}

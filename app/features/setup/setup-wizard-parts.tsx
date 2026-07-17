import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, Check, Circle, Cloud, Loader2, Settings2 } from "lucide-react";
import * as React from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type WizardStep = {
  canOpen: boolean;
  description: string;
  icon: LucideIcon;
  id: string;
  isComplete: boolean;
  title: string;
};

export function WizardLayout({
  activeStep,
  children,
  failed = false,
  isComplete = false,
  onStepSelect,
  steps
}: {
  activeStep: number;
  children: React.ReactNode;
  failed?: boolean;
  isComplete?: boolean;
  onStepSelect: (index: number) => void;
  steps: WizardStep[];
}): React.ReactElement {
  const current = isComplete ? "ready" : activeStep === 0 ? "authorize" : "configure";
  const [openStep, setOpenStep] = React.useState(current);
  React.useEffect(() => setOpenStep(current), [current]);
  const configureStep = steps[activeStep];

  return (
    <Accordion
      aria-label="Setup progress"
      className="flex flex-col gap-2"
      collapsible
      type="single"
      value={openStep}
      onValueChange={(value) => {
        if (value) setOpenStep(value);
      }}
    >
      <OnboardingStep
        description="Checkout was verified and the license was carried into this Worker."
        icon={Check}
        status="complete"
        title="Purchase Pro"
        value="purchase"
      >
        <p className="text-sm text-muted-foreground">
          HQBase Billing issued a short-lived install claim. The full license is stored only as a
          masked secret in your Cloudflare account.
        </p>
      </OnboardingStep>
      <OnboardingStep
        description="The Worker, database, mail bucket, and queues are in your Cloudflare account."
        icon={Check}
        status="complete"
        title="Deploy resources"
        value="deploy"
      >
        <p className="text-sm text-muted-foreground">
          The licensed build is running under the Worker name selected during Deploy to Cloudflare.
        </p>
      </OnboardingStep>
      <OnboardingStep
        description={
          activeStep === 0
            ? (steps[0]?.description ?? "Checking the temporary grant")
            : "Installation access verified"
        }
        icon={Cloud}
        status={activeStep === 0 ? (failed ? "failed" : "current") : "complete"}
        title="Authorize and install"
        value="authorize"
      >
        {activeStep === 0 ? (
          <div className="[&>section>header]:sr-only">{children}</div>
        ) : (
          <p className="text-sm text-muted-foreground">
            The purchase, Worker identity, licensed build, and temporary setup grant have been
            verified.
          </p>
        )}
      </OnboardingStep>
      <OnboardingStep
        description={
          isComplete
            ? "Domain, owner, and shared addresses configured"
            : activeStep > 0
              ? `${configureStep?.title ?? "Workspace"} · ${activeStep} of 3`
              : "Domain, owner, and mailboxes"
        }
        disabled={activeStep === 0 || isComplete}
        icon={Settings2}
        status={
          isComplete ? "complete" : activeStep > 0 ? (failed ? "failed" : "current") : "upcoming"
        }
        title="Configure workspace"
        value="configure"
        onOpen={() => {
          if (activeStep > 0) onStepSelect(activeStep);
        }}
      >
        {activeStep > 0 ? <div className="[&>section>header]:sr-only">{children}</div> : null}
      </OnboardingStep>
      <OnboardingStep
        description={
          isComplete ? "Workspace setup is complete." : "Sign in to your self-hosted Pro workspace."
        }
        disabled={!isComplete}
        icon={isComplete ? Check : Circle}
        status={isComplete ? "current" : "upcoming"}
        title="Ready"
        value="ready"
      >
        {isComplete ? <div className="[&>section>header]:sr-only">{children}</div> : null}
      </OnboardingStep>
    </Accordion>
  );
}

export function OnboardingStep({
  children,
  description,
  disabled = false,
  icon: Icon,
  onOpen,
  status,
  title,
  value
}: {
  children?: React.ReactNode;
  description: string;
  disabled?: boolean;
  icon: LucideIcon;
  onOpen?: () => void;
  status: "complete" | "current" | "upcoming" | "failed";
  title: string;
  value: string;
}): React.ReactElement {
  const label =
    status === "complete"
      ? "Complete"
      : status === "current"
        ? "Current"
        : status === "failed"
          ? "Needs attention"
          : "Upcoming";
  return (
    <AccordionItem
      className="overflow-hidden rounded-lg border bg-card px-4 data-[state=open]:border-foreground/20"
      disabled={disabled}
      value={value}
    >
      <AccordionTrigger className="gap-3 py-4 hover:no-underline" onClick={onOpen}>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border bg-background",
            status === "complete" && "bg-foreground text-background",
            status === "failed" && "border-destructive/40 text-destructive"
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{title}</span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
          </span>
          <span className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">
            {description}
          </span>
        </span>
      </AccordionTrigger>
      {children ? <AccordionContent className="border-t pt-5">{children}</AccordionContent> : null}
    </AccordionItem>
  );
}

export function WizardPanel({
  actions,
  children,
  description,
  title
}: {
  actions: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
}): React.ReactElement {
  return (
    <section aria-labelledby="setup-step-title" className="w-full">
      <header className="border-b border-border/80 pb-6">
        <h2 id="setup-step-title" className="text-xl font-medium tracking-tight sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </header>
      <div className="flex flex-col gap-6 py-6">{children}</div>
      {actions ? <footer className="border-t border-border/80 pt-5">{actions}</footer> : null}
    </section>
  );
}

export function WizardActions({
  isLoading = false,
  nextDisabled = false,
  nextLabel,
  onBack,
  onNext
}: {
  isLoading?: boolean;
  nextDisabled?: boolean;
  nextLabel: string;
  onBack: (() => void) | null;
  onNext: () => void;
}): React.ReactElement {
  return (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button disabled={nextDisabled || isLoading} type="button" onClick={onNext}>
        {isLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        {nextLabel}
        {!isLoading ? <ArrowRight data-icon="inline-end" /> : null}
      </Button>
    </div>
  );
}

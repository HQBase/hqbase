import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, Check, Circle, CircleAlert, Loader2 } from "lucide-react";
import type * as React from "react";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";

export type WizardStep = {
  icon: LucideIcon;
  title: string;
};

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

export function WizardLayout({
  accessFailed = false,
  accessReady,
  activeStep,
  children,
  steps
}: {
  accessFailed?: boolean;
  accessReady: boolean;
  activeStep: number;
  children: React.ReactNode;
  steps: WizardStep[];
}): React.ReactElement {
  if (!accessReady) {
    return <InstallationTimeline failed={accessFailed}>{children}</InstallationTimeline>;
  }

  return (
    <section aria-label="Configure workspace" className="py-6">
      <ConfigurationProgress activeStep={activeStep} steps={steps} />
      <div className="mt-8">{children}</div>
    </section>
  );
}

function InstallationTimeline({
  children,
  failed
}: {
  children: React.ReactNode;
  failed: boolean;
}): React.ReactElement {
  return (
    <ol aria-label="Installation steps" className="mt-6 space-y-6">
      <InstallationTimelineStep
        activity="Complete"
        description="Community Worker and storage"
        isLast={false}
        status="complete"
        title="Deploy resources"
      />
      <InstallationTimelineStep
        activity={failed ? "Needs attention" : "In progress"}
        description="Temporary setup access"
        isLast
        status={failed ? "failed" : "current"}
        title="Authorize Cloudflare"
      >
        {children}
      </InstallationTimelineStep>
    </ol>
  );
}

function InstallationTimelineStep({
  activity,
  children,
  description,
  isLast,
  status,
  title
}: {
  activity: string;
  children?: React.ReactNode;
  description: string;
  isLast: boolean;
  status: "complete" | "current" | "failed";
  title: string;
}): React.ReactElement {
  return (
    <li className="relative flex gap-x-3">
      <div
        className={cn(
          "absolute left-0 top-0 flex w-6 justify-center",
          isLast ? "h-6" : "-bottom-6"
        )}
      >
        <span aria-hidden="true" className="w-px bg-border" />
      </div>
      <div className="flex items-start space-x-2.5">
        <div className="relative flex size-6 flex-none items-center justify-center bg-background">
          {status === "complete" ? (
            <Check aria-hidden="true" className="size-5 text-primary" />
          ) : status === "failed" ? (
            <CircleAlert
              aria-hidden="true"
              className="size-4 bg-background text-destructive ring-4 ring-background"
            />
          ) : (
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-primary ring-4 ring-background"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {title}{" "}
            <span
              className={cn(
                "font-normal text-muted-foreground/60",
                status === "failed" && "text-destructive"
              )}
            >
              · {activity}
            </span>
          </p>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p>
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </li>
  );
}

function ConfigurationProgress({
  activeStep,
  steps
}: {
  activeStep: number;
  steps: WizardStep[];
}): React.ReactElement {
  const activeIndex = Math.max(0, activeStep - 1);

  return (
    <ol aria-label="Workspace configuration steps" className="grid grid-cols-3 gap-2">
      {steps.map((step, index) => {
        const status =
          index < activeIndex ? "complete" : index === activeIndex ? "active" : "upcoming";
        const StepIcon = step.icon;

        return (
          <li className="min-w-0" key={step.title}>
            <Progress
              aria-label={`${step.title}: ${status}`}
              className={cn("h-1.5", status === "active" && "animate-pulse")}
              value={status === "complete" ? 100 : status === "active" ? 50 : 0}
            />
            <div className="mt-2 flex min-w-0 items-start gap-1.5">
              {status === "complete" ? (
                <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
              ) : status === "active" ? (
                <StepIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
              ) : (
                <Circle aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "min-w-0 text-xs leading-4 text-muted-foreground",
                  status === "active" && "font-medium text-foreground"
                )}
              >
                {step.title}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function WizardPanel({
  actions,
  ariaLabel,
  children,
  description,
  showHeader = true,
  title
}: {
  actions: React.ReactNode;
  ariaLabel?: string;
  children: React.ReactNode;
  description: string;
  showHeader?: boolean;
  title: string;
}): React.ReactElement {
  return (
    <section
      aria-label={showHeader ? undefined : (ariaLabel ?? "Setup step")}
      aria-labelledby={showHeader ? "setup-step-title" : undefined}
      className="w-full"
    >
      {showHeader ? (
        <header className="border-b border-border/80 pb-6">
          <h2 id="setup-step-title" className="text-xl font-medium tracking-tight sm:text-2xl">
            {title}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </header>
      ) : null}
      <div className={cn("flex flex-col gap-6", showHeader ? "py-6" : "pb-6")}>{children}</div>
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

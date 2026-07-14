import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import type * as React from "react";

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
  onStepSelect,
  steps
}: {
  activeStep: number;
  children: React.ReactNode;
  onStepSelect: (index: number) => void;
  steps: WizardStep[];
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <nav aria-label="Setup progress" className="py-1">
        <ol className="grid grid-cols-4">
          {steps.map((step, index) => (
            <li
              className={cn(
                "relative min-w-0 after:absolute after:left-[calc(50%+0.875rem)] after:top-3.5 after:h-px after:w-[calc(100%-1.75rem)] after:bg-border after:content-[''] last:after:hidden",
                step.isComplete && "after:bg-foreground/55"
              )}
              key={step.id}
            >
              <StepRailItem
                index={index}
                isActive={index === activeStep}
                step={step}
                onSelect={() => onStepSelect(index)}
              />
            </li>
          ))}
        </ol>
      </nav>
      {children}
    </div>
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
    <section aria-labelledby="setup-step-title" className="mx-auto w-full max-w-2xl">
      <header className="border-b border-border/80 pb-6">
        <h2 id="setup-step-title" className="text-xl font-medium tracking-tight sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
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

function StepRailItem({
  index,
  isActive,
  onSelect,
  step
}: {
  index: number;
  isActive: boolean;
  onSelect: () => void;
  step: WizardStep;
}): React.ReactElement {
  const Icon = step.icon;
  return (
    <Button
      aria-current={isActive ? "step" : undefined}
      aria-label={`${step.title}. ${step.description}`}
      className={cn(
        "relative z-10 h-auto w-full flex-col gap-2 rounded-none bg-transparent px-1 py-0 text-center text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-100",
        isActive && "text-foreground",
        step.isComplete && !isActive && "text-foreground"
      )}
      disabled={!step.canOpen}
      type="button"
      variant="ghost"
      onClick={onSelect}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border bg-background [&_svg]:size-3.5",
          isActive && "border-foreground ring-4 ring-background",
          step.isComplete && "border-foreground bg-foreground text-background"
        )}
      >
        {step.isComplete ? <Check /> : <Icon />}
      </span>
      <span className="max-w-full text-[11px] font-medium leading-4 sm:text-xs">{step.title}</span>
      <span className="sr-only">Step {index + 1}</span>
    </Button>
  );
}

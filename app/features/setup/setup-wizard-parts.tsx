import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
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
    <div className="flex flex-col gap-3">
      <nav aria-label="Setup progress" className="rounded-lg border bg-card p-1">
        <ol className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.id}>
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
  eyebrow,
  title
}: {
  actions: React.ReactNode;
  children: React.ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}): React.ReactElement {
  return (
    <Card className="overflow-hidden bg-card shadow-none">
      <CardHeader className="border-b p-5 sm:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
        <CardTitle className="text-xl font-medium tracking-tight">{title}</CardTitle>
        <CardDescription className="max-w-2xl leading-5">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6">{children}</CardContent>
      <CardFooter className="border-t p-4 sm:px-6">{actions}</CardFooter>
    </Card>
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
        "h-10 w-full justify-start px-2.5 text-left text-muted-foreground",
        isActive && "bg-muted text-foreground",
        step.isComplete && !isActive && "text-foreground"
      )}
      disabled={!step.canOpen}
      type="button"
      variant="ghost"
      onClick={onSelect}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border",
          isActive && "border-foreground",
          step.isComplete && "border-foreground bg-foreground text-background"
        )}
      >
        {step.isComplete ? <Check /> : <Icon />}
      </span>
      <span className="truncate text-xs font-medium">{step.title}</span>
      <span className="sr-only">Step {index + 1}</span>
    </Button>
  );
}

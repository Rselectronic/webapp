"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Upload,
  Cpu,
  Calculator,
  Briefcase,
  ShoppingCart,
  Factory,
  Truck,
  FileText,
  Check,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  WorkflowStep,
  WorkflowStepId,
  WorkflowEntities,
} from "./workflow-types";
import { resolveWorkflowSteps, getNextStep } from "./workflow-types";

const STEP_ICONS: Record<WorkflowStepId, React.ComponentType<{ className?: string }>> = {
  bom_upload: Upload,
  classify: Cpu,
  quote: Calculator,
  job: Briefcase,
  procurement: ShoppingCart,
  production: Factory,
  shipping: Truck,
  invoice: FileText,
};

interface WorkflowStepperProps {
  /** Pass pre-resolved steps, or pass entities and let the component resolve. */
  steps?: WorkflowStep[];
  entities?: WorkflowEntities;
  /** Show the "Next Step" CTA button. */
  showNextAction?: boolean;
  /** Compact mode for banners (smaller text, less padding). */
  compact?: boolean;
  className?: string;
}

export function WorkflowStepper({
  steps: stepsProp,
  entities,
  showNextAction = true,
  compact = false,
  className,
}: WorkflowStepperProps) {
  const steps = stepsProp ?? resolveWorkflowSteps(entities ?? {});
  const nextStep = showNextAction ? getNextStep(steps) : null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Horizontal stepper — desktop */}
      <div className="hidden md:block">
        <div className="flex items-center">
          {steps.map((step, i) => {
            const Icon = STEP_ICONS[step.id];
            const isLast = i === steps.length - 1;
            return (
              <div key={step.id} className="flex flex-1 items-center">
                <StepNode
                  step={step}
                  icon={Icon}
                  compact={compact}
                />
                {!isLast && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-1",
                      step.status === "completed"
                        ? "bg-blue-500"
                        : "bg-gray-200 dark:bg-gray-700"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Vertical stepper — mobile */}
      <div className="md:hidden">
        <div className="flex flex-col gap-1">
          {steps.map((step, i) => {
            const Icon = STEP_ICONS[step.id];
            const isLast = i === steps.length - 1;
            return (
              <div key={step.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <StepNode
                    step={step}
                    icon={Icon}
                    compact={compact}
                    iconOnly
                  />
                  {!isLast && (
                    <div
                      className={cn(
                        "w-0.5 flex-1 min-h-4",
                        step.status === "completed"
                          ? "bg-blue-500"
                          : "bg-gray-200 dark:bg-gray-700"
                      )}
                    />
                  )}
                </div>
                <div className="pb-4">
                  <StepLabel step={step} compact={compact} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Next step CTA */}
      {nextStep && nextStep.href && (
        <div className="flex justify-end">
          <Link href={nextStep.href}>
            <Button size={compact ? "sm" : "default"} className="gap-2">
              Next: {nextStep.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function StepNode({
  step,
  icon: Icon,
  compact,
  iconOnly,
}: {
  step: WorkflowStep;
  icon: React.ComponentType<{ className?: string }>;
  compact: boolean;
  iconOnly?: boolean;
}) {
  const size = compact ? "h-8 w-8" : "h-10 w-10";
  const iconSize = compact ? "h-4 w-4" : "h-5 w-5";

  const nodeContent = (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        size,
        step.status === "completed" &&
          "border-blue-500 bg-blue-500 text-white",
        step.status === "current" &&
          "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
        step.status === "upcoming" &&
          "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500",
        step.status === "skipped" &&
          "border-gray-200 bg-gray-50 text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600"
      )}
    >
      {step.status === "completed" ? (
        <Check className={iconSize} />
      ) : (
        <Icon className={iconSize} />
      )}
    </div>
  );

  const isClickable =
    step.status === "completed" && step.href;

  if (iconOnly) {
    return isClickable ? (
      <Link href={step.href!} className="hover:opacity-80">
        {nodeContent}
      </Link>
    ) : (
      nodeContent
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {isClickable ? (
        <Link href={step.href!} className="hover:opacity-80">
          {nodeContent}
        </Link>
      ) : (
        nodeContent
      )}
      <span
        className={cn(
          "text-center leading-tight whitespace-nowrap",
          compact ? "text-[10px]" : "text-xs",
          step.status === "current"
            ? "font-semibold text-blue-600 dark:text-blue-400"
            : step.status === "completed"
              ? "font-medium text-gray-700 dark:text-gray-300"
              : "text-gray-400 dark:text-gray-500"
        )}
      >
        {compact ? step.shortLabel : step.label}
      </span>
    </div>
  );
}

function StepLabel({
  step,
  compact,
}: {
  step: WorkflowStep;
  compact: boolean;
}) {
  return (
    <span
      className={cn(
        "leading-tight",
        compact ? "text-xs" : "text-sm",
        step.status === "current"
          ? "font-semibold text-blue-600 dark:text-blue-400"
          : step.status === "completed"
            ? "font-medium text-gray-700 dark:text-gray-300"
            : "text-gray-400 dark:text-gray-500"
      )}
    >
      {step.label}
    </span>
  );
}

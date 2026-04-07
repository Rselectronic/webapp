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
  ChevronRight,
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

interface WorkflowBannerProps {
  /** The step this page represents. */
  currentPageStep: WorkflowStepId;
  /** Entity data to resolve the workflow state. */
  entities: WorkflowEntities;
  className?: string;
}

/**
 * A compact banner for entity detail pages showing the current
 * position in the workflow and a "Next Step" CTA.
 */
export function WorkflowBanner({
  currentPageStep,
  entities,
  className,
}: WorkflowBannerProps) {
  const steps = resolveWorkflowSteps(entities);
  const nextStep = getNextStep(steps);
  const currentStepIndex = steps.findIndex((s) => s.id === currentPageStep);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950",
        className
      )}
    >
      {/* Mini step indicators */}
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.id];
          const isThisPage = step.id === currentPageStep;
          const isClickable = step.status === "completed" && step.href;

          const node = (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-1",
                isThisPage && "font-semibold"
              )}
            >
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  step.status === "completed" &&
                    "bg-blue-500 text-white",
                  step.status === "current" &&
                    "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400",
                  step.status === "upcoming" &&
                    "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                )}
              >
                {step.status === "completed" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
              </div>
              {isThisPage && (
                <span
                  className={cn(
                    "text-xs whitespace-nowrap",
                    step.status === "current"
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-300"
                  )}
                >
                  {step.shortLabel}
                </span>
              )}
            </div>
          );

          return (
            <div key={step.id} className="flex items-center gap-1">
              {isClickable && !isThisPage ? (
                <Link href={step.href!} className="hover:opacity-80" title={step.label}>
                  {node}
                </Link>
              ) : (
                node
              )}
              {i < steps.length - 1 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-gray-300 dark:text-gray-600" />
              )}
            </div>
          );
        })}
      </div>

      {/* Next step CTA */}
      {nextStep && nextStep.href && nextStep.id !== currentPageStep && (
        <Link href={nextStep.href} className="shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
            Next: {nextStep.shortLabel}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      )}
    </div>
  );
}

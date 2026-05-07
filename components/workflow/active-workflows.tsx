"use client";

import { WorkflowStepper } from "./workflow-stepper";
import type { WorkflowEntities } from "./workflow-types";

export interface ActiveWorkflowItem {
  /** Stable key for the React list. Use the job_id (or whatever the
   *  driving entity is) so re-renders don't reshuffle DOM by index. */
  key: string;
  /** Display label like "TLAN / TL265-5040-000-T" */
  title: string;
  entities: WorkflowEntities;
}

interface ActiveWorkflowsProps {
  workflows: ActiveWorkflowItem[];
}

/**
 * Renders a list of active workflows on the dashboard, each showing
 * a compact stepper with navigation to the next step.
 */
export function ActiveWorkflows({ workflows }: ActiveWorkflowsProps) {
  if (workflows.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="text-sm">
          No active workflows. Upload a BOM to start a new workflow.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {workflows.map((wf) => (
        <div key={wf.key} className="px-6 py-4">
          <p className="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            {wf.title}
          </p>
          <WorkflowStepper
            entities={wf.entities}
            compact
            showNextAction
          />
        </div>
      ))}
    </div>
  );
}

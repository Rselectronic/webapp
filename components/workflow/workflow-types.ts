export type WorkflowStepId =
  | "bom_upload"
  | "classify"
  | "quote"
  | "job"
  | "procurement"
  | "production"
  | "shipping"
  | "invoice";

export type WorkflowStepStatus =
  | "completed"
  | "current"
  | "upcoming"
  | "skipped";

export interface WorkflowStep {
  id: WorkflowStepId;
  label: string;
  shortLabel: string;
  status: WorkflowStepStatus;
  href?: string;
}

/**
 * Entities linked to a workflow. Pass whichever IDs you have;
 * the resolver will figure out the current step and build hrefs.
 */
export interface WorkflowEntities {
  bomId?: string;
  bomStatus?: string;
  quoteId?: string;
  quoteStatus?: string;
  jobId?: string;
  jobStatus?: string;
  procurementId?: string;
  procurementStatus?: string;
  invoiceId?: string;
  invoiceStatus?: string;
}

/** All eight steps in order with their metadata. */
export const WORKFLOW_STEP_DEFS: {
  id: WorkflowStepId;
  label: string;
  shortLabel: string;
}[] = [
  { id: "bom_upload", label: "BOM Upload", shortLabel: "BOM" },
  { id: "classify", label: "Classify Components", shortLabel: "Classify" },
  { id: "quote", label: "Create Quote", shortLabel: "Quote" },
  { id: "job", label: "Create Job", shortLabel: "Job" },
  { id: "procurement", label: "Procurement", shortLabel: "Procure" },
  { id: "production", label: "Production", shortLabel: "Production" },
  { id: "shipping", label: "Shipping", shortLabel: "Ship" },
  { id: "invoice", label: "Invoice", shortLabel: "Invoice" },
];

/**
 * Determine which step is current and build the full step list
 * from whatever entities exist for this workflow.
 */
export function resolveWorkflowSteps(
  entities: WorkflowEntities
): WorkflowStep[] {
  const {
    bomId,
    bomStatus,
    quoteId,
    quoteStatus,
    jobId,
    jobStatus,
    procurementId,
    procurementStatus,
    invoiceId,
    invoiceStatus,
  } = entities;

  // Determine the highest completed phase index
  let currentIndex = 0; // default: bom_upload is current

  // BOM uploaded?
  if (bomId) {
    currentIndex = 1; // classify is current
    // BOM parsed = classification done
    if (bomStatus === "parsed") {
      currentIndex = 2; // quote is current
    }
  }

  // Quote exists?
  if (quoteId) {
    currentIndex = 3; // job is current
    // Quote not yet accepted — still on quote step
    if (
      quoteStatus === "draft" ||
      quoteStatus === "review" ||
      quoteStatus === "sent"
    ) {
      currentIndex = 2; // still on quote
    }
  }

  // Job exists?
  if (jobId) {
    currentIndex = 4; // procurement is current

    const jStatus = jobStatus ?? "created";

    if (jStatus === "created") {
      currentIndex = 3; // still on job creation step
    }

    if (
      jStatus === "procurement" ||
      jStatus === "parts_ordered" ||
      jStatus === "parts_received"
    ) {
      currentIndex = 4; // procurement
    }

    if (jStatus === "production" || jStatus === "inspection") {
      currentIndex = 5; // production
    }

    if (jStatus === "shipping" || jStatus === "delivered") {
      currentIndex = 6; // shipping
    }

    if (jStatus === "invoiced" || jStatus === "archived") {
      currentIndex = 7; // invoice
    }
  }

  // Procurement exists?
  if (procurementId) {
    const pStatus = procurementStatus ?? "draft";
    if (pStatus === "completed" || pStatus === "fully_received") {
      // procurement done, at least on production
      if (currentIndex < 5) currentIndex = 5;
    } else if (currentIndex < 4) {
      currentIndex = 4;
    }
  }

  // Invoice exists?
  if (invoiceId) {
    currentIndex = 7;
    if (invoiceStatus === "paid") {
      currentIndex = 8; // all done
    }
  }

  // Build href map
  const hrefMap: Partial<Record<WorkflowStepId, string>> = {};
  if (bomId) {
    hrefMap.bom_upload = `/bom/${bomId}`;
    hrefMap.classify = `/bom/${bomId}`;
  } else {
    hrefMap.bom_upload = "/bom/upload";
  }
  if (quoteId) {
    hrefMap.quote = `/quotes/${quoteId}`;
  } else if (bomId) {
    hrefMap.quote = `/quotes/new?bom_id=${bomId}`;
  }
  if (jobId) {
    hrefMap.job = `/jobs/${jobId}`;
  }
  if (procurementId) {
    hrefMap.procurement = `/procurement/${procurementId}`;
  } else if (jobId) {
    hrefMap.procurement = `/procurement/new?job_id=${jobId}`;
  }
  if (jobId) {
    hrefMap.production = `/jobs/${jobId}`;
    hrefMap.shipping = `/jobs/${jobId}`;
  }
  if (invoiceId) {
    hrefMap.invoice = `/invoices/${invoiceId}`;
  }

  return WORKFLOW_STEP_DEFS.map((def, i) => {
    let status: WorkflowStepStatus;
    if (i < currentIndex) {
      status = "completed";
    } else if (i === currentIndex) {
      status = "current";
    } else {
      status = "upcoming";
    }
    return {
      ...def,
      status,
      href: hrefMap[def.id],
    };
  });
}

/**
 * Given the current step ID, return the "next step" info
 * for the CTA button.
 */
export function getNextStep(
  steps: WorkflowStep[]
): WorkflowStep | null {
  const currentIdx = steps.findIndex((s) => s.status === "current");
  if (currentIdx === -1) return null;
  const current = steps[currentIdx];
  // If the current step has an href, that's what we navigate to
  if (current.href) return current;
  // Otherwise look for the next step with an href
  for (let i = currentIdx + 1; i < steps.length; i++) {
    if (steps[i].href) return steps[i];
  }
  return null;
}

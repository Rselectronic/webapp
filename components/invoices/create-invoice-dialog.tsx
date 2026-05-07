"use client";

// ----------------------------------------------------------------------------
// CreateInvoiceDialog (multi-line, partial-invoicing aware)
//
// Controlled dialog. Driven by selection on the Pending Invoice list.
//
// Inputs: a `customerId`, a `customerLabel` for the header, and a list of
// `candidateJobs` (all from the same customer) plus `initialSelectedJobIds`
// for which jobs to seed as lines. Each candidate carries
// `available_to_invoice` (delivered − already invoiced) so we cap qty per line.
//
// Output: POST /api/invoices with shape:
//   { customer_id, lines: [{ job_id, quantity, unit_price?, description? }],
//     freight?, discount?, notes? }
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils/format";

export interface CandidateInvoiceJob {
  id: string;
  job_number: string;
  customer_id: string;
  available_to_invoice: number;
  gmp_number: string | null;
  default_unit_price: number | null;
}

interface InvoiceLineDraft {
  job_id: string;
  qty: string;
  unit_price: string;
}

interface BillingAddressOption {
  label: string;
  street: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  country_code: "CA" | "US" | "OTHER" | null;
  is_default: boolean;
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  customerId: string;
  customerLabel: string;
  candidateJobs: CandidateInvoiceJob[];
  initialSelectedJobIds?: string[];
  /** Optional list of billing addresses for the customer. If provided and
   *  more than one entry, a selector is shown so the operator picks which
   *  address governs tax + currency for this invoice. */
  billingAddresses?: BillingAddressOption[];
}

const TPS_RATE = 0.05;
const TVQ_RATE = 0.09975;

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  customerId,
  customerLabel,
  candidateJobs,
  initialSelectedJobIds,
  billingAddresses,
}: CreateInvoiceDialogProps) {
  const router = useRouter();

  const [lines, setLines] = useState<InvoiceLineDraft[]>([]);
  const [showAddPicker, setShowAddPicker] = useState(false);

  // Invoice-level fields.
  const [freight, setFreight] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");

  // Today in Montreal (YYYY-MM-DD) for the issue-date max attribute. We
  // compute it client-side via en-CA + timezone — same trick the server
  // uses in todayMontreal(). Memoised across opens so the field cap stays
  // stable while the dialog is open.
  const todayMontreal = useMemo(
    () =>
      new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Toronto",
      }),
    []
  );

  // Backdate controls — collapsed by default. Issue date defaults to
  // today; reason is only required when the operator picks a past date.
  const [showBackdate, setShowBackdate] = useState(false);
  const [issuedDate, setIssuedDate] = useState(todayMontreal);
  const [backdateReason, setBackdateReason] = useState("");
  // Billing-address selector. If the parent didn't pass `billingAddresses`,
  // fetch them on open. Default selection: is_default, then first.
  const [fetchedAddresses, setFetchedAddresses] = useState<
    BillingAddressOption[] | null
  >(null);
  const effectiveAddresses: BillingAddressOption[] =
    billingAddresses ?? fetchedAddresses ?? [];
  const defaultBillingLabel =
    effectiveAddresses.find((a) => a.is_default)?.label ??
    effectiveAddresses[0]?.label ??
    "";
  const [billingLabel, setBillingLabel] = useState<string>(defaultBillingLabel);
  useEffect(() => {
    if (open) setBillingLabel(defaultBillingLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId, fetchedAddresses]);

  useEffect(() => {
    // Only auto-fetch when the parent didn't supply addresses.
    if (!open || billingAddresses || !customerId) return;
    let cancelled = false;
    fetch(`/api/customers/${customerId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const arr = Array.isArray(data.billing_addresses)
          ? (data.billing_addresses as BillingAddressOption[])
          : [];
        setFetchedAddresses(arr);
      })
      .catch(() => {
        // Silent — selector just stays hidden if fetch fails.
      });
    return () => {
      cancelled = true;
    };
  }, [open, customerId, billingAddresses]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // (Re)seed lines whenever the dialog opens or the seed list changes.
  useEffect(() => {
    if (!open) return;
    const seedIds = initialSelectedJobIds ?? [];
    const seeded: InvoiceLineDraft[] = seedIds
      .map((id) => candidateJobs.find((j) => j.id === id))
      .filter((j): j is CandidateInvoiceJob => Boolean(j))
      .map((j) => ({
        job_id: j.id,
        qty: String(j.available_to_invoice),
        unit_price:
          j.default_unit_price != null ? String(j.default_unit_price) : "",
      }));
    setLines(seeded);
    setShowAddPicker(false);
    setSubmitError(null);
    setFreight("0");
    setDiscount("0");
    setNotes("");
    setShowBackdate(false);
    setIssuedDate(todayMontreal);
    setBackdateReason("");
  }, [open, initialSelectedJobIds, candidateJobs, todayMontreal]);

  // Lookup helpers.
  const jobById = useMemo(() => {
    const m = new Map<string, CandidateInvoiceJob>();
    for (const j of candidateJobs) m.set(j.id, j);
    return m;
  }, [candidateJobs]);

  const includedJobIds = useMemo(
    () => new Set(lines.map((l) => l.job_id)),
    [lines]
  );

  const addableJobs = useMemo(
    () => candidateJobs.filter((j) => !includedJobIds.has(j.id)),
    [candidateJobs, includedJobIds]
  );

  // Derive "TLAN" from "TLAN — Lanka...".
  const customerCode = useMemo(() => {
    return customerLabel.split(" ")[0]?.replace("—", "").trim() || "";
  }, [customerLabel]);

  function updateLineQty(jobId: string, qty: string) {
    setLines((prev) =>
      prev.map((l) => (l.job_id === jobId ? { ...l, qty } : l))
    );
  }

  function updateLineUnitPrice(jobId: string, unit_price: string) {
    setLines((prev) =>
      prev.map((l) => (l.job_id === jobId ? { ...l, unit_price } : l))
    );
  }

  function removeLine(jobId: string) {
    setLines((prev) => prev.filter((l) => l.job_id !== jobId));
  }

  function addJobLine(job: CandidateInvoiceJob) {
    setLines((prev) => [
      ...prev,
      {
        job_id: job.id,
        qty: String(job.available_to_invoice),
        unit_price:
          job.default_unit_price != null ? String(job.default_unit_price) : "",
      },
    ]);
    setShowAddPicker(false);
  }

  // Per-line validation. qty must be a positive integer ≤ available;
  // unit_price must be a non-negative number (blank = invalid here, since
  // the route can fall back, but pre-populating in the UI is better UX —
  // we still enforce a value).
  const lineValidations = lines.map((l) => {
    const job = jobById.get(l.job_id);
    const available = job?.available_to_invoice ?? 0;
    const parsedQty = l.qty === "" ? NaN : Number(l.qty);
    const validQty =
      Number.isFinite(parsedQty) && Number.isInteger(parsedQty) && parsedQty >= 1;
    let qtyError: string | null = null;
    if (!validQty) {
      qtyError = l.qty === "" ? "Required" : "Must be a positive integer";
    } else if (parsedQty > available) {
      qtyError = `Exceeds available (${available})`;
    }

    const parsedPrice = l.unit_price === "" ? NaN : Number(l.unit_price);
    const validPrice = Number.isFinite(parsedPrice) && parsedPrice >= 0;
    let priceError: string | null = null;
    if (!validPrice) {
      priceError =
        l.unit_price === ""
          ? "Required (no quote pricing — set unit price)"
          : "Must be ≥ 0";
    }

    const lineTotal = validQty && validPrice ? parsedQty * parsedPrice : 0;

    return {
      jobId: l.job_id,
      parsedQty,
      parsedPrice,
      qtyError,
      priceError,
      lineTotal,
      hasError: Boolean(qtyError || priceError),
    };
  });

  const allLinesValid =
    lines.length > 0 && lineValidations.every((v) => !v.hasError);

  const subtotal = lineValidations.reduce(
    (s, v) => s + (v.hasError ? 0 : v.lineTotal),
    0
  );
  const freightNum = Number(freight) || 0;
  const discountNum = Number(discount) || 0;
  const tpsGst = Math.round(subtotal * TPS_RATE * 100) / 100;
  const tvqQst = Math.round(subtotal * TVQ_RATE * 100) / 100;
  const total =
    Math.round(
      (subtotal + tpsGst + tvqQst + freightNum - discountNum) * 100
    ) / 100;

  // Backdate validation. The picker's `max` attribute already prevents
  // future dates in compliant browsers, but we re-check here so a stale
  // typed value doesn't sneak through. When the operator picks a past
  // date, a reason is REQUIRED — that's the audit-trail anchor.
  const isBackdated = issuedDate !== "" && issuedDate < todayMontreal;
  const issuedDateError =
    issuedDate === ""
      ? "Issue date is required"
      : issuedDate > todayMontreal
        ? "Issue date cannot be in the future"
        : null;
  const backdateReasonError =
    isBackdated && backdateReason.trim().length === 0
      ? "Reason is required when backdating"
      : null;

  const canSubmit =
    !submitting &&
    allLinesValid &&
    customerId.length > 0 &&
    !issuedDateError &&
    !backdateReasonError;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        customer_id: customerId,
        lines: lineValidations.map((v) => ({
          job_id: v.jobId,
          quantity: v.parsedQty,
          unit_price: v.parsedPrice,
        })),
        freight: freightNum || 0,
        discount: discountNum || 0,
        notes: notes.trim() || undefined,
        billing_address_label: billingLabel || undefined,
        // Only send issued_date / backdate_reason when actually backdated.
        // Sending today is a no-op server-side; omitting keeps the network
        // payload clean and the audit log free of false-positive backdate
        // markers.
        issued_date: isBackdated ? issuedDate : undefined,
        backdate_reason: isBackdated ? backdateReason.trim() : undefined,
      };

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Failed to create invoice"
        );
      }
      const created = (await res.json().catch(() => null)) as {
        id?: string;
        invoice_number?: string;
      } | null;

      // Open the generated PDF in a new tab. Pop the tab BEFORE the dialog
      // closes / router.refresh fires so the click is still inside the user-
      // gesture window — otherwise some browsers (Safari, hardened Chrome)
      // suppress window.open as a popup.
      if (created?.id) {
        window.open(`/api/invoices/${created.id}/pdf`, "_blank", "noopener");
      }
      if (created?.invoice_number) {
        toast.success(`Invoice ${created.invoice_number} created`, {
          description: "PDF opened in a new tab.",
        });
      } else {
        toast.success("Invoice created");
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create invoice"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[95vw] max-w-5xl sm:max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Customer header — single, fixed at the invoice level. */}
          <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900/40">
            <span className="text-gray-500">Customer:</span>{" "}
            <span className="font-medium">{customerLabel || "—"}</span>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <Label>Jobs on this invoice</Label>
            {lines.length === 0 ? (
              <p className="text-sm italic text-gray-500">
                No jobs included. Add at least one job below.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((l) => {
                  const job = jobById.get(l.job_id);
                  const v = lineValidations.find((x) => x.jobId === l.job_id);
                  if (!job || !v) return null;
                  return (
                    <li
                      key={l.job_id}
                      className="rounded-md border px-3 py-2 dark:border-gray-800"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-[180px] flex-1 text-sm">
                          <span className="font-mono font-medium">
                            {job.job_number}
                          </span>
                          {job.gmp_number ? (
                            <span className="ml-2 font-mono text-gray-500">
                              · {job.gmp_number}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Qty:</span>
                          <Input
                            type="number"
                            min={1}
                            max={job.available_to_invoice}
                            step={1}
                            value={l.qty}
                            onChange={(e) =>
                              updateLineQty(l.job_id, e.target.value)
                            }
                            className="w-20"
                          />
                          <span className="whitespace-nowrap text-xs text-gray-500">
                            of {job.available_to_invoice} remaining
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            Unit price:
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step="0.0001"
                            value={l.unit_price}
                            onChange={(e) =>
                              updateLineUnitPrice(l.job_id, e.target.value)
                            }
                            className="w-28 font-mono"
                          />
                        </div>

                        <div className="ml-auto whitespace-nowrap text-sm">
                          <span className="text-gray-500">Line:</span>{" "}
                          <span className="font-mono font-medium">
                            {formatCurrency(v.lineTotal)}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                          onClick={() => removeLine(l.job_id)}
                          aria-label={`Remove ${job.job_number}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {(v.qtyError || v.priceError) && (
                        <p className="mt-1 text-xs text-red-600">
                          {[v.qtyError, v.priceError].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Add-another picker. */}
            {addableJobs.length > 0 && (
              <div className="pt-1">
                {showAddPicker ? (
                  <div className="rounded-md border p-2 dark:border-gray-800">
                    <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                      Add a {customerCode || "customer"} job
                    </p>
                    <ul className="divide-y dark:divide-gray-800">
                      {addableJobs.map((j) => (
                        <li
                          key={j.id}
                          className="flex items-center justify-between gap-2 py-1.5 text-sm"
                        >
                          <span>
                            <span className="font-mono">{j.job_number}</span>
                            {j.gmp_number ? (
                              <span className="ml-2 font-mono text-gray-500">
                                · {j.gmp_number}
                              </span>
                            ) : null}
                            <span className="ml-2 text-xs text-gray-500">
                              ({j.available_to_invoice} available)
                            </span>
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addJobLine(j)}
                          >
                            Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddPicker(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-blue-600"
                    onClick={() => setShowAddPicker(true)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add another {customerCode || "customer"} job
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Invoice-level fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="invoice-freight">Freight ($)</Label>
              <Input
                id="invoice-freight"
                type="number"
                step="0.01"
                min="0"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="invoice-discount">Discount ($)</Label>
              <Input
                id="invoice-discount"
                type="number"
                step="0.01"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>

          {/* Backdating — collapsed by default. Operator clicks the link to
              expose an issue-date picker + reason field; default behavior
              ("Issue today") is unchanged. The reason becomes mandatory the
              moment a past date is chosen, since it's the only artefact in
              the audit trail explaining why the issue date doesn't match
              the row's created_at. */}
          <div>
            {!showBackdate ? (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Issue date: {todayMontreal} (today)</span>
                <button
                  type="button"
                  onClick={() => setShowBackdate(true)}
                  className="text-blue-600 hover:underline"
                >
                  Backdate this invoice
                </button>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="invoice-issued-date">Issue date</Label>
                    <Input
                      id="invoice-issued-date"
                      type="date"
                      value={issuedDate}
                      max={todayMontreal}
                      onChange={(e) => setIssuedDate(e.target.value)}
                      className="mt-1"
                    />
                    {issuedDateError && (
                      <p className="mt-1 text-xs text-red-600">{issuedDateError}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="invoice-backdate-reason">
                      Reason {isBackdated ? <span className="text-red-600">*</span> : null}
                    </Label>
                    <Input
                      id="invoice-backdate-reason"
                      type="text"
                      value={backdateReason}
                      onChange={(e) => setBackdateReason(e.target.value)}
                      placeholder="e.g. customer requested re-date for FY close"
                      className="mt-1"
                      disabled={!isBackdated}
                    />
                    {backdateReasonError && (
                      <p className="mt-1 text-xs text-red-600">{backdateReasonError}</p>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  Due date will be derived from issue date + payment terms.
                  For USD invoices, the FX rate is re-fetched as of the issue
                  date. The reason is stamped into invoice notes for the
                  audit trail.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowBackdate(false);
                    setIssuedDate(todayMontreal);
                    setBackdateReason("");
                  }}
                  className="mt-2 text-xs text-gray-500 hover:underline"
                >
                  Cancel — issue today
                </button>
              </div>
            )}
          </div>

          {/* Billing address — drives tax region + currency. Hidden when
              the customer has zero or one billing address (nothing to pick). */}
          {effectiveAddresses.length > 1 ? (
            <div>
              <Label htmlFor="invoice-billing-address">Billing Address</Label>
              <Select
                value={billingLabel}
                onValueChange={(v) => setBillingLabel(v ?? "")}
              >
                <SelectTrigger
                  id="invoice-billing-address"
                  className="mt-1 h-9 w-full"
                >
                  <SelectValue>
                    {(v: string) => {
                      const a = effectiveAddresses.find((a) => a.label === v);
                      if (!a) return v;
                      const place = [a.city, a.province, a.country_code]
                        .filter(Boolean)
                        .join(", ");
                      return `${a.label}${place ? ` — ${place}` : ""}${a.is_default ? " (default)" : ""}`;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {effectiveAddresses.map((a) => {
                    const place = [a.city, a.province, a.country_code]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <SelectItem key={a.label} value={a.label}>
                        {a.label}
                        {place ? ` — ${place}` : ""}
                        {a.is_default ? " (default)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-gray-500">
                Tax region and currency are derived from the selected address.
              </p>
            </div>
          ) : null}

          <div>
            <Label htmlFor="invoice-notes">Notes (optional)</Label>
            <textarea
              id="invoice-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Optional invoice notes..."
            />
          </div>

          {/* Live total preview */}
          <div className="rounded-md border bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/40">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">
                  Subtotal ({lines.length} line{lines.length === 1 ? "" : "s"})
                </span>
                <span className="font-mono">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">TPS/GST (5%)</span>
                <span className="font-mono">{formatCurrency(tpsGst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">TVQ/QST (9.975%)</span>
                <span className="font-mono">{formatCurrency(tvqQst)}</span>
              </div>
              {freightNum > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Freight</span>
                  <span className="font-mono">{formatCurrency(freightNum)}</span>
                </div>
              )}
              {discountNum > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Discount</span>
                  <span className="font-mono text-green-600">
                    -{formatCurrency(discountNum)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>Estimated Total</span>
                <span className="font-mono">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {submitError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {submitting
                ? "Creating..."
                : `Create Invoice${lines.length > 1 ? ` (${lines.length} jobs)` : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

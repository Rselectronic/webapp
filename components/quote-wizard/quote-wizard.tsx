"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PricingReviewPanel } from "@/components/pricing-review/pricing-review-panel";

type WizardStatus = "draft" | "quantities_done" | "pricing_done" | "complete";
type ProcurementMode =
  | "turnkey"
  | "consign_parts_supplied"
  | "consign_pcb_supplied"
  | "assembly_only";

interface WizardInitial {
  wizard_status: WizardStatus;
  procurement_mode: ProcurementMode | null;
  tier_quantities: number[];
  boards_per_panel: number | null;
  ipc_class: number | null;
  solder_type: string | null;
  assembly_type: string | null;
  pinned_preference: string | null;
}

// Bundle of data the PricingReviewPanel needs, loaded by the server page so
// this client component doesn't have to re-fetch. Shape mirrors what the
// standalone /bom/[id]/pricing route already passes.
interface PricingData {
  lines: Parameters<typeof PricingReviewPanel>[0]["lines"];
  selections: Parameters<typeof PricingReviewPanel>[0]["initialSelections"];
  cachedQuotes: Parameters<typeof PricingReviewPanel>[0]["initialCachedQuotes"];
  fxRates: Parameters<typeof PricingReviewPanel>[0]["initialFxRates"];
  overages: Parameters<typeof PricingReviewPanel>[0]["overages"];
  preferences: NonNullable<Parameters<typeof PricingReviewPanel>[0]["initialPreferences"]>;
  customerSuppliedLineIds: string[];
  credentialStatus: Record<string, boolean>;
}

interface Props {
  quoteId: string;
  bomId: string;
  initial: WizardInitial;
  pricingData: PricingData;
}

const PROCUREMENT_OPTIONS: Array<{
  value: ProcurementMode;
  label: string;
  description: string;
}> = [
  {
    value: "turnkey",
    label: "Turnkey",
    description: "RS procures all components AND the PCB, then assembles.",
  },
  {
    value: "consign_parts_supplied",
    label: "Consignment — customer supplies parts",
    description:
      "Customer ships the components to RS. RS procures the PCB and does the assembly.",
  },
  {
    value: "consign_pcb_supplied",
    label: "Consignment — customer supplies PCB",
    description:
      "Customer ships the bare PCBs to RS. RS procures all components and does the assembly.",
  },
  {
    value: "assembly_only",
    label: "Assembly Only",
    description:
      "Customer ships both the components AND the PCBs. RS only charges for assembly labour.",
  },
];

/** Procurement modes that require the component pricing step. */
const MODES_NEED_PRICING = new Set<ProcurementMode>([
  "turnkey",
  "consign_pcb_supplied",
]);

/** Procurement modes where RS charges for PCB fab (step 3 shows PCB inputs). */
const MODES_NEED_PCB_PRICE = new Set<ProcurementMode>([
  "turnkey",
  "consign_parts_supplied",
]);

export function QuoteWizard({ quoteId, bomId: _bomId, initial, pricingData }: Props) {
  const router = useRouter();

  // ---- Active step ----
  const initialStep = useMemo<1 | 2 | 3>(() => {
    if (initial.wizard_status === "pricing_done") return 3;
    if (initial.wizard_status === "quantities_done") return 2;
    return 1;
  }, [initial.wizard_status]);
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);

  // ---- Step 1 state ----
  const [tierInput, setTierInput] = useState(initial.tier_quantities.join(", "));
  const [procurementMode, setProcurementMode] = useState<ProcurementMode | null>(
    initial.procurement_mode
  );
  const [saving, setSaving] = useState(false);

  // ---- Step 2 eligibility (derived from procurement mode) ----
  const skipsPricingStep =
    procurementMode !== null && !MODES_NEED_PRICING.has(procurementMode);

  const STEPS: Array<{ n: 1 | 2 | 3; label: string; disabledReason?: string }> = [
    { n: 1, label: "Quantities & Mode" },
    {
      n: 2,
      label: "Component Pricing",
      disabledReason: skipsPricingStep
        ? "Customer supplies the parts — RS doesn't procure, so pricing is skipped."
        : undefined,
    },
    { n: 3, label: "Board Details & Calculate" },
  ];

  // ---- Save step 1 → advance to step 2 (or 3 if pricing skipped) ----
  async function saveStep1() {
    const parsedTiers = parseTierInput(tierInput);
    if (parsedTiers.length === 0) {
      toast.error("Enter at least one tier quantity (positive integer).");
      return;
    }
    if (!procurementMode) {
      toast.error("Select a procurement mode.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/wizard`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier_quantities: parsedTiers,
          procurement_mode: procurementMode,
          wizard_status: "quantities_done",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Step 1 saved");

      // Advance — skip step 2 when the mode doesn't involve component procurement.
      const nextStep: 1 | 2 | 3 = MODES_NEED_PRICING.has(procurementMode) ? 2 : 3;
      setStep(nextStep);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to save", { description: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Step progress bar */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const reachable = canReachStep(s.n, initial.wizard_status, skipsPricingStep);
          const disabled = !reachable || Boolean(s.disabledReason);
          const isActive = step === s.n;
          const isDone = stepIsDone(s.n, initial.wizard_status);
          return (
            <div key={s.n} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => !disabled && setStep(s.n)}
                disabled={disabled}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : isDone
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : disabled
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
                title={s.disabledReason}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                    isActive
                      ? "bg-white/20"
                      : isDone
                        ? "bg-green-600 text-white"
                        : "bg-gray-300 dark:bg-gray-700"
                  }`}
                >
                  {isDone ? <Check className="h-3 w-3" /> : s.n}
                </span>
                <span>{s.label}</span>
                {s.disabledReason && <X className="h-3 w-3 opacity-60" />}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-gray-400" />}
            </div>
          );
        })}
      </div>

      {/* Step content — every step that applies to this procurement_mode is
          kept MOUNTED, with only the active one visible. Conditional
          unmount+remount was wiping in-memory state (fetched quotes, selections
          typed but not saved) whenever the user navigated between steps. */}
      <div className={step === 1 ? "" : "hidden"}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Quantities &amp; Procurement Mode</CardTitle>
            <CardDescription>
              Enter the tier quantities the customer asked for, then pick who procures what.
              This determines which steps the wizard shows next.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="mb-1 block">Tier Quantities (required)</Label>
              <Input
                value={tierInput}
                onChange={(e) => setTierInput(e.target.value)}
                placeholder="e.g. 50, 100, 250, 500"
                className="max-w-md"
              />
              <p className="mt-1 text-xs text-gray-500">
                Comma-separated positive integers. At least one required.
              </p>
              {parseTierInput(tierInput).length > 0 && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  {parseTierInput(tierInput).map((q) => (
                    <Badge key={q} variant="secondary">{q}</Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Procurement Mode (required)</Label>
              <div className="grid gap-2">
                {PROCUREMENT_OPTIONS.map((opt) => {
                  const checked = procurementMode === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition ${
                        checked
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                          : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                      }`}
                    >
                      <input
                        type="radio"
                        name="procurement_mode"
                        value={opt.value}
                        checked={checked}
                        onChange={() => setProcurementMode(opt.value)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{opt.label}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {opt.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveStep1} disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                ) : (
                  "Save & Continue"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {!skipsPricingStep && (
      <div className={step === 2 ? "" : "hidden"}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              2. Component Pricing
            </h3>
            <p className="text-sm text-gray-500">
              Pull supplier prices at each tier&apos;s actual order qty (qty/board × tier + overage extras),
              pick a distributor per line (or auto-pick with a preference), and flag customer-supplied parts.
            </p>
          </div>

          <PricingReviewPanel
            bomId={_bomId}
            lines={pricingData.lines}
            initialSelections={pricingData.selections}
            initialCachedQuotes={pricingData.cachedQuotes}
            initialFxRates={pricingData.fxRates}
            overages={pricingData.overages}
            credentialStatus={pricingData.credentialStatus}
            quoteId={quoteId}
            tiersFromQuote={initial.tier_quantities}
            initialPreferences={pricingData.preferences}
            pinnedPreferenceId={initial.pinned_preference}
            initialCustomerSupplied={pricingData.customerSuppliedLineIds}
          />

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={async () => {
                // Mark pricing_done so the stepper reflects progress even if
                // the user just opens + closes the page without fully finishing.
                await fetch(`/api/quotes/${quoteId}/wizard`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ wizard_status: "pricing_done" }),
                });
                setStep(3);
              }}
            >
              Continue to Step 3
            </Button>
          </div>
        </div>
      </div>
      )}

      <div className={step === 3 ? "" : "hidden"}>
        <Step3Form
          quoteId={quoteId}
          bomId={_bomId}
          procurementMode={procurementMode}
          initial={initial}
          tiers={initial.tier_quantities}
          onBack={() => setStep(skipsPricingStep ? 1 : 2)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — board details + per-tier PCB price + NRE + calculate
// ---------------------------------------------------------------------------

interface PricingTierResult {
  board_qty: number;
  component_cost: number;
  pcb_cost: number;
  assembly_cost: number;
  nre_charge: number;
  shipping: number;
  subtotal: number;
  per_unit: number;
  components_with_price: number;
  components_missing_price: number;
}

interface PricingResult {
  tiers: PricingTierResult[];
  warnings: string[];
  missing_price_components?: Array<{ mpn: string; description: string; qty_per_board: number }>;
}

const SKIP_PCB: Set<ProcurementMode> = new Set(["consign_pcb_supplied", "assembly_only"]);

function Step3Form({
  quoteId,
  bomId: _bomId,
  procurementMode,
  initial,
  tiers,
  onBack,
}: {
  quoteId: string;
  bomId: string;
  procurementMode: ProcurementMode | null;
  initial: WizardInitial;
  tiers: number[];
  onBack: () => void;
}) {
  const skipsPcb = procurementMode !== null && SKIP_PCB.has(procurementMode);

  // Board details — editable fields mirroring the quotes columns.
  const [boardsPerPanel, setBoardsPerPanel] = useState(
    initial.boards_per_panel?.toString() ?? "1"
  );
  const [ipcClass, setIpcClass] = useState<1 | 2 | 3>(
    (initial.ipc_class as 1 | 2 | 3) ?? 2
  );
  const [solderType, setSolderType] = useState<"leaded" | "leadfree">(
    initial.solder_type === "leaded" ? "leaded" : "leadfree"
  );
  const [assemblyType, setAssemblyType] = useState<string>(initial.assembly_type ?? "TB");

  // Per-tier PCB price — keyed by qty, stored as string while the user types.
  const [tierPcb, setTierPcb] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const t of tiers) m[String(t)] = "";
    return m;
  });

  // NRE inputs — flat dollars added once, not per-tier.
  const [nreProgramming, setNreProgramming] = useState("");
  const [nreStencil, setNreStencil] = useState("");
  const [nreSetup, setNreSetup] = useState("");
  const [nrePcbFab, setNrePcbFab] = useState("");
  const [nreMisc, setNreMisc] = useState("");
  const [shippingFlat, setShippingFlat] = useState("");

  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<PricingResult | null>(null);

  async function runCalculate() {
    const panel = Number(boardsPerPanel);
    if (!Number.isInteger(panel) || panel <= 0) {
      toast.error("Boards per panel must be a positive integer.");
      return;
    }

    const tierPcbNums: Record<string, number> = {};
    if (!skipsPcb) {
      for (const t of tiers) {
        const raw = tierPcb[String(t)] ?? "";
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          toast.error(`PCB price for tier ${t} must be a non-negative number.`);
          return;
        }
        tierPcbNums[String(t)] = n;
      }
    }

    setCalculating(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boards_per_panel: panel,
          ipc_class: ipcClass,
          solder_type: solderType,
          assembly_type: assemblyType,
          tier_pcb_prices: tierPcbNums,
          nre_programming: toNumOrZero(nreProgramming),
          nre_stencil: toNumOrZero(nreStencil),
          nre_setup: toNumOrZero(nreSetup),
          nre_pcb_fab: toNumOrZero(nrePcbFab),
          nre_misc: toNumOrZero(nreMisc),
          shipping_flat: toNumOrZero(shippingFlat),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data.pricing as PricingResult);
      toast.success("Quote calculated & saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Calculate failed", { description: msg });
    } finally {
      setCalculating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          3. Board Details &amp; Pricing
        </h3>
        <p className="text-sm text-gray-500">
          Enter the physical board parameters and PCB/NRE charges, then click Calculate.
          Component prices pinned in step 2 flow through automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Board Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs text-gray-500">Boards per Panel</Label>
            <Input
              type="number"
              min={1}
              value={boardsPerPanel}
              onChange={(e) => setBoardsPerPanel(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-gray-500">Assembly Type</Label>
            <select
              value={assemblyType}
              onChange={(e) => setAssemblyType(e.target.value)}
              className="h-9 w-full rounded-md border bg-white dark:bg-gray-950 dark:border-gray-700 px-2 text-sm"
            >
              <option value="TB">TB — Top + Bottom</option>
              <option value="TS">TS — Top-side only</option>
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-gray-500">IPC Class</Label>
            <div className="flex gap-3">
              {[1, 2, 3].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="ipc_class"
                    checked={ipcClass === n}
                    onChange={() => setIpcClass(n as 1 | 2 | 3)}
                  />
                  Class {n}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-gray-500">Solder</Label>
            <div className="flex gap-3">
              <label className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="solder_type"
                  checked={solderType === "leadfree"}
                  onChange={() => setSolderType("leadfree")}
                />
                Lead-free
              </label>
              <label className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="solder_type"
                  checked={solderType === "leaded"}
                  onChange={() => setSolderType("leaded")}
                />
                Leaded
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {!skipsPcb && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">PCB Unit Price (per tier)</CardTitle>
            <CardDescription>
              Quoted PCB fab cost per bare board at each tier quantity. Get this from the PCB vendor
              (WMD, Candor, PCBWay…).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {tiers.map((t) => (
              <div key={t}>
                <Label className="mb-1 block text-xs text-gray-500">Qty {t} — $ per PCB</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={tierPcb[String(t)] ?? ""}
                  onChange={(e) =>
                    setTierPcb((prev) => ({ ...prev, [String(t)]: e.target.value }))
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">NRE &amp; Shipping</CardTitle>
          <CardDescription>
            Non-recurring engineering charges and a flat shipping allowance. All values are in CAD
            and apply once per quote (not per tier).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {[
            { label: "Programming", value: nreProgramming, set: setNreProgramming },
            { label: "Stencil", value: nreStencil, set: setNreStencil },
            { label: "Setup", value: nreSetup, set: setNreSetup },
            { label: "PCB Fab (one-time)", value: nrePcbFab, set: setNrePcbFab, hide: skipsPcb },
            { label: "Misc", value: nreMisc, set: setNreMisc },
            { label: "Shipping (flat)", value: shippingFlat, set: setShippingFlat },
          ]
            .filter((f) => !f.hide)
            .map((f) => (
              <div key={f.label}>
                <Label className="mb-1 block text-xs text-gray-500">{f.label}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                />
              </div>
            ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button onClick={runCalculate} disabled={calculating} size="lg">
          {calculating ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Calculating…</>
          ) : (
            "Calculate & Save"
          )}
        </Button>
      </div>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tier Breakdown</CardTitle>
            <CardDescription>
              Saved to this quote. Component prices come from the pinned selections; customer-
              supplied lines are excluded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500 bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Components</th>
                    <th className="text-right px-3 py-2">PCB</th>
                    <th className="text-right px-3 py-2">Assembly</th>
                    <th className="text-right px-3 py-2">NRE</th>
                    <th className="text-right px-3 py-2">Shipping</th>
                    <th className="text-right px-3 py-2 font-semibold">Subtotal</th>
                    <th className="text-right px-3 py-2 font-semibold">Per Unit</th>
                    <th className="text-right px-3 py-2">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tiers.map((t) => (
                    <tr key={t.board_qty} className="border-t dark:border-gray-800">
                      <td className="text-right px-3 py-2 font-mono">{t.board_qty}</td>
                      <td className="text-right px-3 py-2 font-mono">${t.component_cost.toFixed(2)}</td>
                      <td className="text-right px-3 py-2 font-mono">${t.pcb_cost.toFixed(2)}</td>
                      <td className="text-right px-3 py-2 font-mono">${t.assembly_cost.toFixed(2)}</td>
                      <td className="text-right px-3 py-2 font-mono">${t.nre_charge.toFixed(2)}</td>
                      <td className="text-right px-3 py-2 font-mono">${t.shipping.toFixed(2)}</td>
                      <td className="text-right px-3 py-2 font-mono font-semibold">${t.subtotal.toFixed(2)}</td>
                      <td className="text-right px-3 py-2 font-mono font-semibold">${t.per_unit.toFixed(2)}</td>
                      <td className="text-right px-3 py-2 text-xs text-gray-500">
                        {t.components_missing_price > 0 && (
                          <span className="text-red-600">
                            {t.components_missing_price} line{t.components_missing_price === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.missing_price_components && result.missing_price_components.length > 0 && (
              <div className="mt-3 text-xs text-red-600">
                {result.missing_price_components.length} component
                {result.missing_price_components.length === 1 ? "" : "s"} have no pinned price —
                go back to step 2 and pick a supplier.
              </div>
            )}
            {result.warnings?.length > 0 && (
              <ul className="mt-3 text-xs text-amber-600 list-disc pl-4">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function toNumOrZero(raw: string): number {
  if (!raw || !raw.trim()) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// ---- Helpers ----

function parseTierInput(raw: string): number[] {
  const parts = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (Number.isInteger(n) && n > 0) out.push(n);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function stepIsDone(n: 1 | 2 | 3, status: WizardStatus): boolean {
  if (n === 1) return status === "quantities_done" || status === "pricing_done" || status === "complete";
  if (n === 2) return status === "pricing_done" || status === "complete";
  if (n === 3) return status === "complete";
  return false;
}

function canReachStep(
  n: 1 | 2 | 3,
  status: WizardStatus,
  skipsPricing: boolean
): boolean {
  if (n === 1) return true;
  if (n === 2) {
    if (skipsPricing) return false;
    return status === "quantities_done" || status === "pricing_done" || status === "complete";
  }
  // n === 3
  return status === "quantities_done" || status === "pricing_done" || status === "complete";
}

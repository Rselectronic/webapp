"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { todayMontreal } from "@/lib/utils/format";

interface Customer {
  id: string;
  code: string;
  company_name: string;
}

interface Gmp {
  id: string;
  gmp_number: string;
  board_name: string | null;
}

interface Candidate {
  quote_id: string;
  quote_number: string;
  tier_qty: number;
  unit_price: number;
  subtotal: number;
  match_reason: "exact" | "closest-not-greater" | "manual-override";
}

interface LinePreview {
  line_index: number;
  needs_manual?: boolean;
  matched_quote_id?: string;
  matched_quote_number?: string;
  source_tier_qty?: number;
  frozen_unit_price?: number;
  frozen_subtotal?: number;
  price_match_reason?: string;
  quoted_nre_total?: number;
  candidates?: Candidate[];
}

interface LineRow {
  id: string; // local id for React key
  gmp_id: string;
  quantity: number | "";
  po_unit_price: number | "";
  override_quote_id: string; // picked via candidates dropdown (optional)
  nre_included_on_po: boolean;
  nre_charge_cad: number | "";
  preview: LinePreview | null;
  previewing: boolean;
}

function newLine(): LineRow {
  return {
    id: crypto.randomUUID(),
    gmp_id: "",
    quantity: "",
    po_unit_price: "",
    override_quote_id: "",
    nre_included_on_po: false,
    nre_charge_cad: "",
    preview: null,
    previewing: false,
  };
}

export function NewJobFromPoForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState("");
  const [gmps, setGmps] = useState<Gmp[]>([]);
  const [loadingGmps, setLoadingGmps] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState(() => todayMontreal());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([newLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load GMPs when customer changes
  useEffect(() => {
    if (!customerId) {
      setGmps([]);
      setLines([newLine()]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingGmps(true);
      try {
        const res = await fetch(`/api/gmps?customer_id=${customerId}`);
        if (res.ok) {
          const data = await res.json();
          const list: Gmp[] = Array.isArray(data) ? data : data.gmps ?? [];
          if (!cancelled) setGmps(list);
        }
      } finally {
        if (!cancelled) setLoadingGmps(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const updateLine = (id: string, patch: Partial<LineRow>) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  };

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (id: string) =>
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)
    );

  const previewLine = async (id: string) => {
    const line = lines.find((l) => l.id === id);
    if (!line || !customerId || !line.gmp_id || !line.quantity) return;
    updateLine(id, { previewing: true, preview: null });
    setError(null);
    try {
      const res = await fetch("/api/jobs/from-po?preview=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          po_number: poNumber || "PREVIEW",
          po_date: poDate,
          lines: [{ gmp_id: line.gmp_id, quantity: line.quantity }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const p: LinePreview = data.previews?.[0] ?? {
        line_index: 0,
        needs_manual: true,
      };
      updateLine(id, {
        preview: p,
        previewing: false,
        override_quote_id: p.matched_quote_id ?? "",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateLine(id, { previewing: false });
      toast.error("Preview failed", { description: msg });
    }
  };

  const canSubmit =
    customerId &&
    poNumber.trim() &&
    poDate &&
    lines.every(
      (l) =>
        l.gmp_id &&
        typeof l.quantity === "number" &&
        l.quantity > 0 &&
        l.preview &&
        !l.preview.needs_manual
    );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        customer_id: customerId,
        po_number: poNumber,
        po_date: poDate,
        notes: notes || undefined,
        lines: lines.map((l) => {
          const override =
            l.override_quote_id &&
            l.preview?.candidates?.find(
              (c) => c.quote_id === l.override_quote_id
            );
          const usingOverride =
            override && override.quote_id !== l.preview?.matched_quote_id;
          return {
            gmp_id: l.gmp_id,
            quantity: l.quantity,
            po_unit_price:
              typeof l.po_unit_price === "number" ? l.po_unit_price : null,
            nre_included_on_po: l.nre_included_on_po,
            nre_charge_cad:
              l.nre_included_on_po && typeof l.nre_charge_cad === "number"
                ? l.nre_charge_cad
                : null,
            ...(usingOverride
              ? {
                  preferred_quote_id: override!.quote_id,
                  manual_tier_qty: override!.tier_qty,
                }
              : {}),
          };
        }),
      };
      const res = await fetch("/api/jobs/from-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const count = data.jobs?.length ?? 0;
      toast.success(`Created ${count} job${count === 1 ? "" : "s"} for PO #${poNumber}`);
      router.push("/jobs");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Create failed", { description: msg });
      setSubmitting(false);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PO Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="customer">Customer</Label>
            <Select
              value={customerId || "__none__"}
              onValueChange={(v) =>
                setCustomerId(v == null || v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger id="customer" className="w-full">
                <SelectValue>
                  {(v: string) => {
                    if (!v || v === "__none__") return "Select customer...";
                    const c = customers.find((c) => c.id === v);
                    return c ? `${c.code} — ${c.company_name}` : "";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select customer...</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="po-number">PO Number</Label>
              <Input
                id="po-number"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. 4500123456"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="po-date">PO Date</Label>
              <Input
                id="po-date"
                type="date"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boards on this PO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line, idx) => (
            <div
              key={line.id}
              className="space-y-3 rounded-md border p-4"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Board {idx + 1}</div>
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(line.id)}
                    aria-label="Remove board"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid gap-2">
                <Label>GMP / Board</Label>
                <Select
                  value={line.gmp_id || "__none__"}
                  onValueChange={(v) =>
                    updateLine(line.id, {
                      gmp_id: v == null || v === "__none__" ? "" : v,
                      preview: null,
                      override_quote_id: "",
                    })
                  }
                  disabled={!customerId || loadingGmps}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string) => {
                        if (!v || v === "__none__")
                          return loadingGmps ? "Loading..." : "Select GMP...";
                        const g = gmps.find((g) => g.id === v);
                        if (!g) return "";
                        return `${g.gmp_number}${g.board_name ? ` — ${g.board_name}` : ""}`;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      {loadingGmps ? "Loading..." : "Select GMP..."}
                    </SelectItem>
                    {gmps.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.gmp_number}
                        {g.board_name ? ` — ${g.board_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>PO Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(line.id, {
                        quantity: e.target.value
                          ? parseInt(e.target.value, 10)
                          : "",
                        preview: null,
                        override_quote_id: "",
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>PO Unit Price (CAD)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min={0}
                    value={line.po_unit_price}
                    onChange={(e) =>
                      updateLine(line.id, {
                        po_unit_price: e.target.value
                          ? parseFloat(e.target.value)
                          : "",
                      })
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>

              {line.preview &&
                !line.preview.needs_manual &&
                (line.preview.quoted_nre_total ?? 0) > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Quoted NRE: {fmt(line.preview.quoted_nre_total ?? 0)}
                  </div>
                )}

              <div className="flex items-center gap-2">
                <input
                  id={`nre-inc-${line.id}`}
                  type="checkbox"
                  className="h-4 w-4"
                  checked={line.nre_included_on_po}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (checked) {
                      const quoted = line.preview?.quoted_nre_total ?? 0;
                      updateLine(line.id, {
                        nre_included_on_po: true,
                        nre_charge_cad: quoted > 0 ? quoted : "",
                      });
                    } else {
                      updateLine(line.id, {
                        nre_included_on_po: false,
                        nre_charge_cad: "",
                      });
                    }
                  }}
                />
                <Label htmlFor={`nre-inc-${line.id}`} className="cursor-pointer">
                  Customer included NRE on PO
                </Label>
              </div>

              {line.nre_included_on_po && (
                <div className="grid gap-2">
                  <Label>NRE Charge (CAD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={line.nre_charge_cad}
                    onChange={(e) =>
                      updateLine(line.id, {
                        nre_charge_cad: e.target.value
                          ? parseFloat(e.target.value)
                          : "",
                      })
                    }
                    placeholder="0.00"
                  />
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => previewLine(line.id)}
                disabled={
                  !customerId ||
                  !line.gmp_id ||
                  !line.quantity ||
                  line.previewing
                }
              >
                {line.previewing ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Matching...
                  </>
                ) : (
                  "Preview match"
                )}
              </Button>

              {line.preview && (
                <div className="space-y-2">
                  {line.preview.needs_manual ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                      No active quote has a tier at or below quantity{" "}
                      {String(line.quantity)}. Create a quote for this PO
                      quantity before creating the job.
                    </div>
                  ) : (
                    <>
                      <div className="rounded-md border bg-muted/30 p-3 text-sm">
                        <div className="font-medium">
                          {line.preview.matched_quote_number} → Tier{" "}
                          {line.preview.source_tier_qty} → Unit{" "}
                          {fmt(line.preview.frozen_unit_price ?? 0)} → Total{" "}
                          {fmt(line.preview.frozen_subtotal ?? 0)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Match: {line.preview.price_match_reason}
                        </div>
                      </div>

                      {line.preview.candidates &&
                        line.preview.candidates.length > 1 && (
                          <div className="grid gap-2">
                            <Label>Override quote match (optional)</Label>
                            <Select
                              value={line.override_quote_id}
                              onValueChange={(v) =>
                                updateLine(line.id, {
                                  override_quote_id: v ?? "",
                                })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue>
                                  {(v: string) => {
                                    const c = line.preview?.candidates?.find(
                                      (c) => c.quote_id === v
                                    );
                                    if (!c) return "";
                                    return `${c.quote_number} — tier ${c.tier_qty} @ ${fmt(c.unit_price)} (${c.match_reason})`;
                                  }}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {line.preview.candidates.map((c) => (
                                  <SelectItem key={c.quote_id} value={c.quote_id}>
                                    {c.quote_number} — tier {c.tier_qty} @{" "}
                                    {fmt(c.unit_price)} ({c.match_reason})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addLine}
            disabled={!customerId}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add another board
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="w-full"
        size="lg"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            Creating jobs...
          </>
        ) : (
          `Create ${lines.length} Job${lines.length === 1 ? "" : "s"}`
        )}
      </Button>
    </div>
  );
}

"use client";

// ---------------------------------------------------------------------------
// CustomerQuoteModal — single-line import.
//
// Opens from a row in the pricing review when the operator already has a
// real distributor quote (emailed PDF, rep quote, ad-hoc supplier) and wants
// to override whatever the API returned. Writes a customer_quote row into
// api_pricing_cache; the rank in recompute.ts ensures it outranks API hits.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** What this quote is for. Either mpn or bom_line_id is required. */
  bomLineId: string;
  mpn: string | null;
  cpc: string | null;
  description: string | null;
}

export function CustomerQuoteModal({
  open,
  onClose,
  onSaved,
  bomLineId,
  mpn,
  cpc,
  description,
}: Props) {
  const [supplierName, setSupplierName] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [currency, setCurrency] = useState("CAD");
  const [qtyBreak, setQtyBreak] = useState("");
  const [quoteRef, setQuoteRef] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [supplierPart, setSupplierPart] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time we open for a different line so leftover values
  // from the previous row don't bleed in.
  useEffect(() => {
    if (!open) return;
    setSupplierName("");
    setUnitPrice("");
    setCurrency("CAD");
    setQtyBreak("");
    setQuoteRef("");
    setValidUntil("");
    setSupplierPart("");
    setError(null);
  }, [open, bomLineId]);

  if (!open) return null;

  const price = parseFloat(unitPrice);
  const canSave =
    supplierName.trim().length > 0 &&
    Number.isFinite(price) &&
    price > 0 &&
    !busy;

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        supplier_name: supplierName.trim(),
        unit_price: price,
        currency,
      };
      if (mpn?.trim()) payload.mpn = mpn.trim();
      else payload.bom_line_id = bomLineId;
      const qb = parseInt(qtyBreak, 10);
      if (Number.isFinite(qb) && qb > 0) payload.qty_break = qb;
      if (quoteRef.trim()) payload.quote_ref = quoteRef.trim();
      if (validUntil) payload.valid_until = validUntil;
      if (supplierPart.trim()) payload.supplier_part_number = supplierPart.trim();

      const res = await fetch("/api/pricing/customer-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const identity = mpn?.trim() || cpc?.trim() || "(no MPN — keyed by line id)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Import distributor quote
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          For <span className="font-mono">{identity}</span>
          {description ? ` — ${description}` : ""}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Distributor <span className="text-red-600">*</span>
            </label>
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="WMD, DigiKey rep, Future, ..."
              disabled={busy}
              className="mt-1 h-8"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Unit price <span className="text-red-600">*</span>
              </label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
                disabled={busy}
                className="mt-1 h-8 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={busy}
                className="mt-1 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CNY">CNY</option>
                <option value="JPY">JPY</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Qty break
              </label>
              <Input
                type="number"
                min="1"
                step="1"
                value={qtyBreak}
                onChange={(e) => setQtyBreak(e.target.value)}
                placeholder="1"
                disabled={busy}
                className="mt-1 h-8 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Valid until
              </label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                disabled={busy}
                className="mt-1 h-8"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Quote reference
            </label>
            <Input
              value={quoteRef}
              onChange={(e) => setQuoteRef(e.target.value)}
              placeholder="email subject, PO #, rep quote #"
              disabled={busy}
              className="mt-1 h-8"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Distributor part number
            </label>
            <Input
              value={supplierPart}
              onChange={(e) => setSupplierPart(e.target.value)}
              placeholder="optional"
              disabled={busy}
              className="mt-1 h-8 font-mono"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save quote"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

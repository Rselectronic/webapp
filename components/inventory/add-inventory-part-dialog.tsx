"use client";

// ----------------------------------------------------------------------------
// components/inventory/add-inventory-part-dialog.tsx
// Create a new inventory part (BG or Safety) via POST /api/inventory.
// ----------------------------------------------------------------------------

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  INVENTORY_POOLS,
  poolLabel,
  type InventoryPartStock,
  type InventoryPool,
} from "@/lib/inventory/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (part: InventoryPartStock) => void;
}

export function AddInventoryPartDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [serialNo, setSerialNo] = useState("");
  const [cpc, setCpc] = useState("");
  const [mpn, setMpn] = useState("");
  const [pool, setPool] = useState<InventoryPool>("bg");
  const [manufacturer, setManufacturer] = useState("");
  const [description, setDescription] = useState("");
  const [minThreshold, setMinThreshold] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setSerialNo("");
    setCpc("");
    setMpn("");
    setPool("bg");
    setManufacturer("");
    setDescription("");
    setMinThreshold("");
    setInitialStock("");
    setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // CPC is the business identity — leave it as the operator typed it (no
    // forced upper-casing; some customer CPCs are case-sensitive).
    const cpcTrimmed = cpc.trim();
    if (!cpcTrimmed) {
      toast.error("CPC is required");
      return;
    }

    const minThresholdNum = minThreshold.trim()
      ? Number(minThreshold)
      : null;
    if (
      minThresholdNum != null &&
      (!Number.isFinite(minThresholdNum) || minThresholdNum < 0)
    ) {
      toast.error("Min threshold must be a non-negative number");
      return;
    }

    const initialStockNum = initialStock.trim() ? Number(initialStock) : 0;
    if (
      !Number.isFinite(initialStockNum) ||
      initialStockNum < 0 ||
      !Number.isInteger(initialStockNum)
    ) {
      toast.error("Initial stock must be a non-negative integer");
      return;
    }

    const serialTrimmed = serialNo.trim();
    const serialPayload = serialTrimmed === "" ? null : serialTrimmed;

    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serial_no: serialPayload,
          cpc: cpcTrimmed,
          mpn: mpn.trim() || null,
          pool,
          manufacturer: manufacturer.trim() || null,
          description: description.trim() || null,
          min_stock_threshold: minThresholdNum,
          initial_stock: initialStockNum,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Create failed");

      // The API may return the full row (preferred) or just the id. Build a
      // shape that satisfies the table either way.
      const created: InventoryPartStock =
        j.part ??
        ({
          id: j.id,
          serial_no: serialPayload,
          cpc: cpcTrimmed,
          mpn: mpn.trim() || null,
          manufacturer: manufacturer.trim() || null,
          description: description.trim() || null,
          pool,
          min_stock_threshold: minThresholdNum,
          is_active: true,
          notes: notes.trim() || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          physical_qty: initialStockNum,
          reserved_qty: 0,
          available_qty: initialStockNum,
        } as InventoryPartStock);

      onCreated(created);
      toast.success(`Added ${created.cpc}`);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add inventory part</DialogTitle>
          <DialogDescription>
            BG parts are pulled from feeder stock. Safety parts are critical
            spares we always keep on hand.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Serial No. lives above CPC to match the operator's BG Excel
              layout (Serial · CPC · MPN · …). Optional — empty means no
              feeder slot is currently assigned. */}
          <div>
            <Label htmlFor="inv-serial">Serial No.</Label>
            <Input
              id="inv-serial"
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              placeholder="e.g. 47 (feeder slot)"
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inv-cpc">CPC *</Label>
              <Input
                id="inv-cpc"
                value={cpc}
                onChange={(e) => setCpc(e.target.value)}
                placeholder="Customer Part Code"
                className="font-mono"
                required
              />
            </div>
            <div>
              <Label htmlFor="inv-pool">Pool *</Label>
              <Select
                value={pool}
                onValueChange={(v) => v && setPool(v as InventoryPool)}
              >
                <SelectTrigger id="inv-pool" className="mt-1 w-full">
                  <SelectValue>
                    {(v: string) => v ? poolLabel(v as InventoryPool) : ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_POOLS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {poolLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inv-mpn">MPN</Label>
              <Input
                id="inv-mpn"
                value={mpn}
                onChange={(e) => setMpn(e.target.value)}
                placeholder="GRM188R71H103KA01D"
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="inv-mfr">Manufacturer</Label>
              <Input
                id="inv-mfr"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="Murata"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="inv-desc">Description</Label>
            <Input
              id="inv-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="CAP CER 10nF 50V X7R 0603"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inv-min">Min stock threshold</Label>
              <Input
                id="inv-min"
                type="number"
                step={1}
                min={0}
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                placeholder="0"
              />
              <p className="mt-1 text-xs text-gray-500">
                Flag the part when available drops below this.
              </p>
            </div>
            <div>
              <Label htmlFor="inv-initial">Initial stock</Label>
              <Input
                id="inv-initial"
                type="number"
                step={1}
                min={0}
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
                placeholder="0"
              />
              <p className="mt-1 text-xs text-gray-500">
                Records an <code>initial_stock</code> movement on save.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="inv-notes">Notes</Label>
            <Textarea
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Add part"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

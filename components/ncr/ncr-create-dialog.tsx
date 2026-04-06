"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NCR_CATEGORIES: Record<string, string[]> = {
  "Soldering Defect": ["Cold Joint", "Bridge", "Insufficient", "Excess"],
  Component: ["Wrong Part", "Missing Part", "Damaged", "Wrong Orientation"],
  PCB: ["Delamination", "Trace Damage", "Plating Issue"],
  Assembly: ["Wrong Placement", "Missing", "Reversed"],
  Cosmetic: ["Scratched", "Stained", "Bent"],
  Other: [],
};

const SEVERITIES = ["minor", "major", "critical"] as const;

interface NCRCreateDialogProps {
  jobId?: string;
  customerId: string;
}

export function NCRCreateDialog({
  jobId,
  customerId,
}: NCRCreateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [description, setDescription] = useState("");

  const subcategories = category ? (NCR_CATEGORIES[category] ?? []) : [];

  function resetForm() {
    setCategory("");
    setSubcategory("");
    setSeverity("minor");
    setDescription("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !description) return;

    setLoading(true);
    try {
      const res = await fetch("/api/ncr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId ?? null,
          customer_id: customerId,
          category,
          subcategory: subcategory || null,
          severity,
          description,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create NCR");
      }

      const ncr = await res.json();
      resetForm();
      setOpen(false);
      router.push(`/quality/${ncr.id}`);
    } catch (err) {
      console.error("NCR creation failed:", err);
      alert(err instanceof Error ? err.message : "Failed to create NCR");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="mr-1.5 h-4 w-4" />
            Report NCR
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Non-Conformance Report</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="ncr-category">Category *</Label>
            <Select
              value={category}
              onValueChange={(val) => {
                if (val) {
                  setCategory(val);
                  setSubcategory("");
                }
              }}
            >
              <SelectTrigger id="ncr-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(NCR_CATEGORIES).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subcategory */}
          {subcategories.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="ncr-subcategory">Subcategory</Label>
              <Select value={subcategory} onValueChange={(v) => v && setSubcategory(v)}>
                <SelectTrigger id="ncr-subcategory">
                  <SelectValue placeholder="Select subcategory" />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Severity */}
          <div className="space-y-2">
            <Label htmlFor="ncr-severity">Severity</Label>
            <Select value={severity} onValueChange={(v) => v && setSeverity(v)}>
              <SelectTrigger id="ncr-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="ncr-description">Description *</Label>
            <Textarea
              id="ncr-description"
              placeholder="Describe the non-conformance in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !category || !description}
            >
              {loading ? "Creating..." : "Create NCR"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

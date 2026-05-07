"use client";

// ----------------------------------------------------------------------------
// EditBomMetaButton
//
// Inline edit affordance on the BOM detail page for the four labelling
// fields that operators sometimes forget on upload:
//   - bom_name
//   - revision
//   - gerber_name
//   - gerber_revision
//
// These are pure metadata — they don't affect parsing — so we can update
// them in place via PATCH /api/bom/[id] without re-running the parser.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EditBomMetaButtonProps {
  bomId: string;
  fileName: string;
  initial: {
    bom_name: string | null;
    revision: string | null;
    gerber_name: string | null;
    gerber_revision: string | null;
  };
}

export function EditBomMetaButton({
  bomId,
  fileName,
  initial,
}: EditBomMetaButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bomName, setBomName] = useState(initial.bom_name ?? "");
  const [revision, setRevision] = useState(initial.revision ?? "");
  const [gerberName, setGerberName] = useState(initial.gerber_name ?? "");
  const [gerberRevision, setGerberRevision] = useState(
    initial.gerber_revision ?? ""
  );

  function reset() {
    setBomName(initial.bom_name ?? "");
    setRevision(initial.revision ?? "");
    setGerberName(initial.gerber_name ?? "");
    setGerberRevision(initial.gerber_revision ?? "");
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Send every field. Empty string is a valid clear — the API treats
      // empty-after-trim as NULL, so the operator can also wipe a value
      // (e.g. fix a typo by clearing it).
      const res = await fetch(`/api/bom/${bomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_name: bomName,
          revision: revision,
          gerber_name: gerberName,
          gerber_revision: gerberRevision,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? `Failed (HTTP ${res.status})`
        );
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Pencil className="mr-2 h-3.5 w-3.5" />
        Edit Details
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit BOM Details</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{fileName}</span>. These are
              metadata fields only — editing them never re-parses the BOM.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
              <div>
                <Label htmlFor="bom-meta-name">BOM Name</Label>
                <Input
                  id="bom-meta-name"
                  value={bomName}
                  onChange={(e) => setBomName(e.target.value)}
                  placeholder={fileName}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="bom-meta-rev">BOM Version</Label>
                <Input
                  id="bom-meta-rev"
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  placeholder="e.g. 1, V5"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="bom-meta-gerber-name">Gerber Name</Label>
                <Input
                  id="bom-meta-gerber-name"
                  value={gerberName}
                  onChange={(e) => setGerberName(e.target.value)}
                  placeholder="e.g. TL265-5001-000-T_Gerber"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="bom-meta-gerber-rev">Gerber Revision</Label>
                <Input
                  id="bom-meta-gerber-rev"
                  value={gerberRevision}
                  onChange={(e) => setGerberRevision(e.target.value)}
                  placeholder="e.g. V3, Rev A"
                  className="mt-1"
                />
              </div>
            </div>

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

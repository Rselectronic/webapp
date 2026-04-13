"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface Props {
  terms: string[];
}

export function PaymentTermsSettings({ terms: initial }: Props) {
  const [terms, setTerms] = useState<string[]>(initial);
  const [newTerm, setNewTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addTerm() {
    const trimmed = newTerm.trim();
    if (!trimmed) return;
    if (terms.includes(trimmed)) {
      setError("This payment term already exists.");
      return;
    }
    setTerms((prev) => [...prev, trimmed]);
    setNewTerm("");
    setSaved(false);
    setError(null);
  }

  function removeTerm(index: number) {
    setTerms((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTerm();
    }
  }

  async function handleSave() {
    if (terms.length === 0) {
      setError("You must have at least one payment term.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings?key=payment_terms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(terms),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment Terms</CardTitle>
          <CardDescription>
            Manage the list of payment terms available when creating or editing
            customers. These appear as dropdown options in the customer form.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing terms list */}
          <div className="space-y-2">
            {terms.length === 0 && (
              <p className="text-sm text-gray-500 py-4 text-center border border-dashed rounded-md">
                No payment terms configured. Add one below.
              </p>
            )}
            {terms.map((term, index) => (
              <div
                key={`${term}-${index}`}
                className="flex items-center gap-3 rounded-md border px-3 py-2 dark:border-gray-700"
              >
                <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
                <span className="flex-1 text-sm">{term}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeTerm(index)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {/* Add new term */}
          <div className="flex items-center gap-2">
            <Input
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Net 90, COD, 2/10 Net 30"
              className="max-w-[300px]"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addTerm}
              disabled={!newTerm.trim()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Payment Terms"}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Payment terms saved.</p>}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
}

// Multi-value chip input for supplier payment terms. Operators type a
// term and press Enter or comma; an existing chip can be removed via the
// "x" button. Pasting "Credit Card, Net 30" splits into two chips at once
// because that's how operators copy from emails / PDFs in practice.
export function PaymentTermsInput({ value, onChange, placeholder, id }: Props) {
  const [draft, setDraft] = useState("");

  function addTerms(raw: string) {
    const parts = raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) {
      // Case-insensitive de-dupe so "Net 30" and "net 30" don't both stick.
      if (next.some((existing) => existing.toLowerCase() === p.toLowerCase())) {
        continue;
      }
      next.push(p);
    }
    if (next.length !== value.length) onChange(next);
  }

  function commitDraft() {
    if (!draft.trim()) return;
    addTerms(draft);
    setDraft("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      // Backspace on empty input removes the last chip — common pattern
      // for tag inputs.
      onChange(value.slice(0, -1));
    }
  }

  function handleBlur() {
    // Don't lose what the operator typed if they tab away without
    // pressing Enter.
    commitDraft();
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 rounded-md border bg-white px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500/20">
      {value.map((term, i) => (
        <span
          key={`${term}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
        >
          {term}
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-full text-blue-700 hover:bg-blue-200"
            aria-label={`Remove ${term}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={
          value.length === 0 ? (placeholder ?? "Net 30, Credit Card…") : ""
        }
        className="h-7 flex-1 min-w-[120px] border-0 px-1 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

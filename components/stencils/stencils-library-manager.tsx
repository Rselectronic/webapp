"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils/format";

export interface StencilRow {
  id: string;
  position_no: number | null;
  stencil_name: string;
  comments: string | null;
  discarded_at: string | null;
  discarded_reason: string | null;
  discarded_by: string | null;
  discarded_by_name: string | null;
  gmps: string[];
}

function splitGmps(input: string): string[] {
  return input
    .split(/[;,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function GmpMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Search GMP…",
}: {
  options: GmpOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const sel = new Set(selected);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.gmp_number.toLowerCase().includes(q) ||
          (o.board_name ?? "").toLowerCase().includes(q) ||
          (o.customer_code ?? "").toLowerCase().includes(q) ||
          (o.customer_name ?? "").toLowerCase().includes(q)
      )
    : options;

  function toggle(gmp: string) {
    if (sel.has(gmp)) onChange(selected.filter((g) => g !== gmp));
    else onChange([...selected, gmp]);
  }
  function remove(gmp: string) {
    onChange(selected.filter((g) => g !== gmp));
  }

  return (
    <div className="space-y-1.5">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((g) => (
            <span
              key={g}
              className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
            >
              <span className="font-mono">{g}</span>
              <button
                type="button"
                onClick={() => remove(g)}
                className="rounded-full text-blue-600 hover:text-blue-800"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Search + dropdown */}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950">
            {filtered.slice(0, 200).map((o) => {
              const active = sel.has(o.gmp_number);
              return (
                <button
                  key={o.gmp_number}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(o.gmp_number)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-900 ${
                    active ? "bg-blue-50 dark:bg-blue-950" : ""
                  }`}
                >
                  <input type="checkbox" readOnly checked={active} />
                  <span className="font-mono">{o.gmp_number}</span>
                  {o.board_name && (
                    <span className="text-gray-500">· {o.board_name}</span>
                  )}
                  {o.customer_code && (
                    <span className="ml-auto text-[10px] text-gray-400">
                      {o.customer_code}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {open && filtered.length === 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-500 shadow-lg dark:border-gray-800 dark:bg-gray-950">
            No matches. Type a different search.
          </div>
        )}
      </div>
    </div>
  );
}

// Render a TIMESTAMPTZ in Montreal time so production users in India and
// admins in Montreal see the same wall-clock value. Delegates to the
// shared helper in lib/utils/format.ts (RS_TIMEZONE = "America/Toronto").
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

export interface GmpOption {
  gmp_number: string;
  board_name: string | null;
  customer_code: string | null;
  customer_name: string | null;
}

export function StencilsLibraryManager({
  initial,
  gmpOptions = [],
}: {
  initial: StencilRow[];
  gmpOptions?: GmpOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-form state
  const [newName, setNewName] = useState("");
  const [newGmps, setNewGmps] = useState<string[]>([]);
  const [newComments, setNewComments] = useState("");
  const [newPos, setNewPos] = useState("");

  // Edit-form state (for the currently-editing row)
  const [editName, setEditName] = useState("");
  const [editGmps, setEditGmps] = useState<string[]>([]);
  const [editComments, setEditComments] = useState("");
  const [editPos, setEditPos] = useState("");

  // Discard-confirmation modal state.
  const [discardTarget, setDiscardTarget] = useState<StencilRow | null>(null);
  const [discardReason, setDiscardReason] = useState("");

  // Column sort state. Click a header: asc → desc → none.
  // Default to Position ascending so the physical shelf order matches the row
  // order on page load.
  type SortDir = "asc" | "desc" | null;
  const [sortKey, setSortKey] = useState<string | null>("position_no");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function cycleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortKey(null);
    setSortDir(null);
  }

  function getSortVal(s: StencilRow, key: string): string | number | null {
    switch (key) {
      case "position_no":
        return s.position_no ?? Number.MAX_SAFE_INTEGER;
      case "stencil_name":
        return s.stencil_name.toLowerCase();
      case "gmps":
        return s.gmps.join("; ").toLowerCase();
      case "comments":
        return (s.comments ?? "").toLowerCase();
      case "discarded_at":
        return s.discarded_at ?? "";
      case "discarded_reason":
        return (s.discarded_reason ?? "").toLowerCase();
      case "discarded_by_name":
        return (s.discarded_by_name ?? "").toLowerCase();
      default:
        return null;
    }
  }

  function sortRows(rows: StencilRow[]): StencilRow[] {
    if (!sortKey || !sortDir) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getSortVal(a, sortKey);
      const bv = getSortVal(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * dir;
    });
  }

  function SortIndicator({ k }: { k: string }) {
    if (sortKey !== k || !sortDir) {
      return <span className="ml-1 text-[10px] opacity-40">↕</span>;
    }
    return (
      <span className="ml-1 text-[10px]">
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
  }

  const refresh = () => startTransition(() => router.refresh());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initial;
    return initial.filter((s) => {
      return (
        s.stencil_name.toLowerCase().includes(q) ||
        (s.comments ?? "").toLowerCase().includes(q) ||
        s.gmps.some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [initial, search]);

  const active = sortRows(filtered.filter((s) => !s.discarded_at));
  const discarded = sortRows(filtered.filter((s) => !!s.discarded_at));

  async function handleAdd() {
    if (!newName.trim()) {
      alert("Stencil name is required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/stencils-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stencil_name: newName.trim(),
          gmps: newGmps,
          comments: newComments.trim() || null,
          position_no: newPos.trim() ? Number(newPos) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed: ${data.error ?? res.statusText}`);
        return;
      }
      setNewName("");
      setNewGmps([]);
      setNewComments("");
      setNewPos("");
      setAdding(false);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(s: StencilRow) {
    setEditingId(s.id);
    setEditName(s.stencil_name);
    setEditGmps([...s.gmps]);
    setEditComments(s.comments ?? "");
    setEditPos(s.position_no != null ? String(s.position_no) : "");
  }

  async function handleSaveEdit(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/stencils-library/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stencil_name: editName.trim(),
          gmps: editGmps,
          comments: editComments.trim() || null,
          position_no: editPos.trim() ? Number(editPos) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed: ${data.error ?? res.statusText}`);
        return;
      }
      setEditingId(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleDiscard(s: StencilRow) {
    setDiscardReason("");
    setDiscardTarget(s);
  }

  async function confirmDiscard() {
    if (!discardTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/stencils-library/${discardTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discarded_reason: discardReason.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed: ${data.error ?? res.statusText}`);
        return;
      }
      setDiscardTarget(null);
      setDiscardReason("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(s: StencilRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/stencils-library/${s.id}/restore`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed: ${data.error ?? res.statusText}`);
        return;
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search name, GMP, or comments…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex-1" />
        <Button variant="outline" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add stencil"}
        </Button>
      </div>

      {/* Add stencil modal */}
      {adding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setAdding(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900">
            <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">
              Add Stencil
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Stencil name *</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="1118475_REV0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Position no. (optional)</label>
                <Input
                  value={newPos}
                  onChange={(e) => setNewPos(e.target.value)}
                  placeholder="auto-assign next free"
                  inputMode="numeric"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">GMPs</label>
                <GmpMultiSelect
                  options={gmpOptions}
                  selected={newGmps}
                  onChange={setNewGmps}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">Comments</label>
                <Textarea
                  value={newComments}
                  onChange={(e) => setNewComments(e.target.value)}
                  placeholder='e.g. "bottom side only valid for rev A"'
                  rows={2}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Active table */}
      <div>
        <h3 className="mb-2 text-lg font-semibold">Active ({active.length})</h3>
        <div className="overflow-x-auto rounded-md border dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr className="text-left">
                <th
                  className="px-3 py-2 w-16 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => cycleSort("position_no")}
                >
                  Pos<SortIndicator k="position_no" />
                </th>
                <th
                  className="px-3 py-2 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => cycleSort("stencil_name")}
                >
                  Name<SortIndicator k="stencil_name" />
                </th>
                <th
                  className="px-3 py-2 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => cycleSort("gmps")}
                >
                  GMPs<SortIndicator k="gmps" />
                </th>
                <th
                  className="px-3 py-2 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => cycleSort("comments")}
                >
                  Comments<SortIndicator k="comments" />
                </th>
                <th className="px-3 py-2 w-40 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                    No stencils.
                  </td>
                </tr>
              )}
              {active.map((s) => {
                const isEditing = editingId === s.id;
                return (
                  <tr key={s.id} className="border-t dark:border-gray-800">
                    <td className="px-3 py-2 font-mono">
                      {isEditing ? (
                        <Input value={editPos} onChange={(e) => setEditPos(e.target.value)} className="w-20" />
                      ) : (
                        s.position_no ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {isEditing ? (
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      ) : (
                        s.stencil_name
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <GmpMultiSelect options={gmpOptions} selected={editGmps} onChange={setEditGmps} />
                      ) : (
                        <span className="text-xs">{s.gmps.join("; ") || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Textarea
                          value={editComments}
                          onChange={(e) => setEditComments(e.target.value)}
                          rows={1}
                        />
                      ) : (
                        <span className="text-xs">{s.comments ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={busy}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => handleSaveEdit(s.id)} disabled={busy}>
                            Save
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => startEdit(s)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDiscard(s)}>
                            Discard
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Discarded table */}
      <div>
        <button
          type="button"
          className="text-sm font-medium text-gray-700 hover:underline dark:text-gray-300"
          onClick={() => setShowDiscarded((v) => !v)}
        >
          {showDiscarded ? "▾" : "▸"} Discarded ({discarded.length})
        </button>
        {showDiscarded && (
          <div className="mt-2 overflow-x-auto rounded-md border dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr className="text-left">
                  <th
                    className="px-3 py-2 w-16 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => cycleSort("position_no")}
                  >
                    Pos<SortIndicator k="position_no" />
                  </th>
                  <th
                    className="px-3 py-2 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => cycleSort("stencil_name")}
                  >
                    Name<SortIndicator k="stencil_name" />
                  </th>
                  <th
                    className="px-3 py-2 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => cycleSort("gmps")}
                  >
                    GMPs<SortIndicator k="gmps" />
                  </th>
                  <th
                    className="px-3 py-2 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => cycleSort("comments")}
                  >
                    Comments<SortIndicator k="comments" />
                  </th>
                  <th
                    className="px-3 py-2 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => cycleSort("discarded_at")}
                  >
                    Discarded at<SortIndicator k="discarded_at" />
                  </th>
                  <th
                    className="px-3 py-2 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => cycleSort("discarded_reason")}
                  >
                    Reason<SortIndicator k="discarded_reason" />
                  </th>
                  <th
                    className="px-3 py-2 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => cycleSort("discarded_by_name")}
                  >
                    By<SortIndicator k="discarded_by_name" />
                  </th>
                  <th className="px-3 py-2 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {discarded.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                      No discarded stencils.
                    </td>
                  </tr>
                )}
                {discarded.map((s) => (
                  <tr key={s.id} className="border-t text-gray-500 dark:border-gray-800">
                    <td className="px-3 py-2 font-mono">{s.position_no ?? "—"}</td>
                    <td className="px-3 py-2 font-mono line-through">{s.stencil_name}</td>
                    <td className="px-3 py-2 text-xs">{s.gmps.join("; ") || "—"}</td>
                    <td className="px-3 py-2 text-xs">{s.comments ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(s.discarded_at)}</td>
                    <td className="px-3 py-2 text-xs">{s.discarded_reason ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{s.discarded_by_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => handleRestore(s)} disabled={busy}>
                        Restore
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Discard confirmation modal — replaces native confirm/prompt. */}
      {discardTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setDiscardTarget(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Discard stencil?
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                {discardTarget.stencil_name}
              </span>{" "}
              (position {discardTarget.position_no ?? "—"}) will be flagged as
              discarded. Its position number will be reused by the next stencil
              you add.
            </p>
            <label className="mt-4 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Reason for discard (optional)
            </label>
            <textarea
              value={discardReason}
              onChange={(e) => setDiscardReason(e.target.value)}
              placeholder="e.g. Damaged — torn aperture on U5"
              rows={3}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDiscardTarget(null);
                  setDiscardReason("");
                }}
                disabled={busy}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                disabled={busy}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Discarding…" : "Discard"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

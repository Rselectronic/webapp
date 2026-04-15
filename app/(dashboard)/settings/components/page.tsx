"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, ChevronLeft, ChevronRight, Loader2, Trash2, Check, X, Pencil } from "lucide-react";

const M_CODES = [
  "0201", "0402", "CP", "CPEXP", "IP", "TH", "MANSMT", "MEC", "Accs", "CABLE", "DEV B",
];

const M_CODE_SOURCES = ["manual", "database", "rules", "api"];

interface Component {
  id: string;
  mpn: string;
  manufacturer: string | null;
  description: string | null;
  category: string | null;
  package_case: string | null;
  mounting_type: string | null;
  m_code: string | null;
  m_code_source: string | null;
  updated_at: string;
}

interface Stats {
  total: number;
  by_m_code: Record<string, number>;
}

interface ApiResponse {
  items: Component[];
  total: number;
  page: number;
  limit: number;
  stats: Stats;
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ComponentsPage() {
  const [items, setItems] = useState<Component[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, by_m_code: {} });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMCode, setEditMCode] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    mpn: "",
    manufacturer: "",
    description: "",
    m_code: "",
    m_code_source: "manual",
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  const [limit, setLimit] = useState(50);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/components?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to load components");
      }
      const data: ApiResponse = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [page, search, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Search on Enter or debounce
  function handleSearch() {
    setPage(1);
    setSearch(searchInput);
  }

  // Inline M-Code edit
  function startEdit(component: Component) {
    setEditingId(component.id);
    setEditMCode(component.m_code ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditMCode("");
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/components/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          m_code: editMCode || null,
          m_code_source: "manual",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save");
      }
      setEditingId(null);
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteComponent(id: string, mpn: string) {
    if (!confirm(`Delete component "${mpn}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/components/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to delete");
      }
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleAdd() {
    setAddError(null);
    if (!addForm.mpn.trim()) {
      setAddError("MPN is required");
      return;
    }
    setAddSaving(true);
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to add component");
      }
      setAddOpen(false);
      setAddForm({ mpn: "", manufacturer: "", description: "", m_code: "", m_code_source: "manual" });
      fetchData();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddSaving(false);
    }
  }

  // Sort M-code stats for display
  const sortedMCodes = Object.entries(stats.by_m_code).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Component Database</h2>
          <p className="text-sm text-gray-500">
            Master component library with M-Code classifications. Manual edits
            feed back into the classification engine.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Component
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Component</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  MPN <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g. RC0402FR-0710KL"
                  value={addForm.mpn}
                  onChange={(e) =>
                    setAddForm({ ...addForm, mpn: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Manufacturer
                </label>
                <Input
                  placeholder="e.g. Yageo"
                  value={addForm.manufacturer}
                  onChange={(e) =>
                    setAddForm({ ...addForm, manufacturer: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Description
                </label>
                <Input
                  placeholder="e.g. 10K Ohm 1% 0402 Resistor"
                  value={addForm.description}
                  onChange={(e) =>
                    setAddForm({ ...addForm, description: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  M-Code
                </label>
                <Select
                  value={addForm.m_code}
                  onValueChange={(val) =>
                    setAddForm({ ...addForm, m_code: val ?? "" })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select M-Code" />
                  </SelectTrigger>
                  <SelectContent>
                    {M_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Source
                </label>
                <Select
                  value={addForm.m_code_source}
                  onValueChange={(val) =>
                    setAddForm({ ...addForm, m_code_source: val ?? "manual" })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {M_CODE_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {addError && (
                <p className="text-sm text-red-600">{addError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={handleAdd}
                disabled={addSaving}
              >
                {addSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Add Component
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Total Components</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        {sortedMCodes.slice(0, 3).map(([code, count]) => (
          <Card key={code}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">{code}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-gray-400">
                {stats.total > 0
                  ? `${((count / stats.total) * 100).toFixed(1)}%`
                  : "0%"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* M-Code Breakdown */}
      {sortedMCodes.length > 3 && (
        <div className="flex flex-wrap gap-2">
          {sortedMCodes.slice(3).map(([code, count]) => (
            <Badge key={code} variant="outline">
              {code}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by MPN..."
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>
          Search
        </Button>
        {search && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setPage(1);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading components...</span>
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-gray-500">
              {search
                ? `No components found matching "${search}".`
                : "No components in the database yet. Add one to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>MPN</TableHead>
                <TableHead className="w-28">M-Code</TableHead>
                <TableHead className="w-24">Source</TableHead>
                <TableHead className="w-28 hidden sm:table-cell">Updated</TableHead>
                <TableHead className="w-24 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((comp) => (
                <TableRow key={comp.id}>
                  <TableCell className="font-mono text-xs font-medium">
                    {comp.mpn}
                  </TableCell>
                  <TableCell>
                    {editingId === comp.id ? (
                      <div className="flex items-center gap-1">
                        <Select
                          value={editMCode}
                          onValueChange={(val) => setEditMCode(val ?? "")}
                        >
                          <SelectTrigger className="h-7 w-20 text-xs">
                            <SelectValue placeholder="--" />
                          </SelectTrigger>
                          <SelectContent>
                            {M_CODES.map((code) => (
                              <SelectItem key={code} value={code}>
                                {code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={saving}
                          onClick={() => saveEdit(comp.id)}
                        >
                          {saving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3 text-green-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={cancelEdit}
                        >
                          <X className="h-3 w-3 text-gray-400" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(comp)}
                        className="cursor-pointer"
                        title="Click to edit M-Code"
                      >
                        {comp.m_code ? (
                          <Badge variant="outline">{comp.m_code}</Badge>
                        ) : (
                          <span className="text-xs text-gray-400 italic">
                            unassigned
                          </span>
                        )}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-gray-500">
                      {comp.m_code_source ?? "--"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-gray-500">
                    {formatDate(comp.updated_at)}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      {editingId !== comp.id && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => startEdit(comp)}
                          title="Edit M-Code"
                        >
                          <Pencil className="h-3.5 w-3.5 text-gray-400 hover:text-blue-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteComponent(comp.id, comp.mpn)}
                        title="Delete component"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * limit + 1}--
              {Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-500">Rows:</span>
                <Select
                  value={String(limit)}
                  onValueChange={(val) => {
                    setLimit(Number(val));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

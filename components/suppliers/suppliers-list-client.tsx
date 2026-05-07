"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Check, Upload } from "lucide-react";
import { AddSupplierDialog } from "./add-supplier-dialog";
import { ImportSuppliersDialog } from "./import-suppliers-dialog";
import {
  categoryLabel,
  type Supplier,
  type SupplierCategory,
} from "@/lib/suppliers/types";

interface SupplierWithCount extends Supplier {
  contact_count: number;
  // Primary contact (or oldest if no primary set) — surfaced inline on
  // the list so the operator can see who to email at a glance.
  primary_contact: { name: string; email: string | null } | null;
}

interface Props {
  initialSuppliers: SupplierWithCount[];
  isCeo: boolean;
}

type ApprovalFilter = "all" | "approved" | "pending" | "online_only";

export function SuppliersListClient({ initialSuppliers, isCeo }: Props) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<SupplierWithCount[]>(initialSuppliers);
  const [search, setSearch] = useState("");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<SupplierCategory | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (approvalFilter === "approved" && !s.is_approved) return false;
      if (approvalFilter === "pending" && s.is_approved) return false;
      if (approvalFilter === "online_only" && !s.online_only) return false;
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
      if (q) {
        const hay = `${s.code} ${s.legal_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [suppliers, search, approvalFilter, categoryFilter]);

  async function handleApprove(id: string) {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/suppliers/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Approval failed");
      }
      setSuppliers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_approved: true } : s))
      );
      toast.success("Supplier approved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setApprovingId(null);
    }
  }

  function handleCreated(s: SupplierWithCount) {
    setSuppliers((prev) => [s, ...prev]);
    setAddOpen(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Approved Suppliers</h2>
          <p className="text-sm text-gray-500">
            Master list of vendors RS sends purchase orders to. Suppliers must be
            approved by the CEO before they can be selected on a PO.
          </p>
        </div>
        {isCeo && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1 h-4 w-4" />
              Import
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add Supplier
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code or name…"
          className="max-w-xs"
        />

        <div className="flex items-center gap-1 rounded-md border bg-white p-0.5">
          {(["all", "approved", "pending", "online_only"] as ApprovalFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setApprovalFilter(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                approvalFilter === f
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f === "all"
                ? "All"
                : f === "approved"
                  ? "Approved"
                  : f === "pending"
                    ? "Pending"
                    : "Online-only"}
            </button>
          ))}
        </div>

        <Select
          value={categoryFilter}
          onValueChange={(v) =>
            v && setCategoryFilter(v as SupplierCategory | "all")
          }
        >
          <SelectTrigger size="sm" className="text-xs min-w-[10rem]">
            <SelectValue>
              {(v: string) => {
                switch (v) {
                  case "all": return "All categories";
                  case "distributor": return "Distributor";
                  case "pcb_fab": return "PCB Fab";
                  case "stencil": return "Stencil";
                  case "mechanical": return "Mechanical";
                  case "assembly": return "Assembly";
                  case "other": return "Other";
                  default: return "";
                }
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="distributor">Distributor</SelectItem>
            <SelectItem value="pcb_fab">PCB Fab</SelectItem>
            <SelectItem value="stencil">Stencil</SelectItem>
            <SelectItem value="mechanical">Mechanical</SelectItem>
            <SelectItem value="assembly">Assembly</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs text-gray-500">
          {filtered.length} of {suppliers.length}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No suppliers match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Code</th>
                    <th className="px-4 py-2">Legal name</th>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2">Currency</th>
                    <th className="px-4 py-2">Primary contact</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{s.code}</td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/settings/suppliers/${s.id}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          {s.legal_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {categoryLabel(s.category)}
                      </td>
                      <td className="px-4 py-2 text-xs">{s.default_currency}</td>
                      <td className="px-4 py-2 text-xs">
                        {s.primary_contact ? (
                          <div className="flex flex-col leading-tight">
                            <span className="text-gray-900">
                              {s.primary_contact.name}
                            </span>
                            {s.primary_contact.email ? (
                              <a
                                href={`mailto:${s.primary_contact.email}`}
                                className="text-blue-700 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {s.primary_contact.email}
                              </a>
                            ) : (
                              <span className="text-gray-400">no email</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {s.is_approved ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              Approved
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              Pending
                            </Badge>
                          )}
                          {s.online_only && (
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                              Online-only
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!s.is_approved && isCeo && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={approvingId === s.id}
                            onClick={() => handleApprove(s.id)}
                          >
                            <Check className="mr-1 h-3 w-3" />
                            Approve
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <AddSupplierDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={handleCreated}
        />
      )}

      {importOpen && (
        <ImportSuppliersDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => {
            // Imports may create many rows at once. Cheapest path is to
            // refresh server data so contact_count is accurate without
            // re-deriving it client-side.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

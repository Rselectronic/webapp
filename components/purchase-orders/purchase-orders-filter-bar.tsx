"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  initial: {
    supplier?: string;
    status?: string;
    from?: string;
    to?: string;
    search?: string;
  };
}

const STATUS_OPTIONS = [
  "",
  "draft",
  "sent",
  "acknowledged",
  "shipped",
  "received",
  "closed",
];

export function PurchaseOrdersFilterBar({ initial }: Props) {
  const router = useRouter();
  const [supplier, setSupplier] = useState(initial.supplier ?? "");
  const [status, setStatus] = useState(initial.status ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [search, setSearch] = useState(initial.search ?? "");

  function apply() {
    const params = new URLSearchParams();
    if (supplier) params.set("supplier", supplier);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search) params.set("search", search);
    const qs = params.toString();
    router.push(`/purchase-orders${qs ? `?${qs}` : ""}`);
  }

  function clear() {
    setSupplier("");
    setStatus("");
    setFrom("");
    setTo("");
    setSearch("");
    router.push("/purchase-orders");
  }

  return (
    <div className="grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 sm:grid-cols-3 lg:grid-cols-6">
      <div>
        <Label className="text-xs">Supplier</Label>
        <Input
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="DigiKey..."
        />
      </div>
      <div>
        <Label className="text-xs">Status</Label>
        <Select
          value={status === "" ? "__all__" : status}
          onValueChange={(v) =>
            setStatus(v == null || v === "__all__" ? "" : v)
          }
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue>
              {(v: string) => (v === "__all__" || !v ? "All" : v)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s === "" ? "__all__" : s}>
                {s === "" ? "All" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">From</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Search PO #</Label>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="PO-..."
        />
      </div>
      <div className="flex items-end gap-2">
        <Button size="sm" onClick={apply}>
          Apply
        </Button>
        <Button size="sm" variant="outline" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

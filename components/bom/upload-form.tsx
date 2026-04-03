"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";

interface Customer {
  id: string;
  code: string;
  company_name: string;
}

interface Gmp {
  id: string;
  gmp_number: string;
  board_name: string | null;
}

interface UploadFormProps {
  customers: Customer[];
}

export function UploadForm({ customers }: UploadFormProps) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [gmps, setGmps] = useState<Gmp[]>([]);
  const [gmpId, setGmpId] = useState("");
  const [newGmpNumber, setNewGmpNumber] = useState("");
  const [isNewGmp, setIsNewGmp] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleCustomerChange = useCallback(async (id: string | null) => {
    if (!id) return;
    setCustomerId(id);
    setGmpId("");
    setIsNewGmp(false);
    setGmps([]);

    const res = await fetch(`/api/gmps?customer_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setGmps(data.gmps ?? []);
      if ((data.gmps ?? []).length === 0) setIsNewGmp(true);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleUpload = async () => {
    if (!file || !customerId) return;
    setUploading(true);
    setError(null);

    try {
      let resolvedGmpId = gmpId;

      if (isNewGmp && newGmpNumber) {
        const gmpRes = await fetch("/api/gmps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_id: customerId, gmp_number: newGmpNumber }),
        });
        if (!gmpRes.ok) {
          const err = await gmpRes.json();
          throw new Error(err.error ?? "Failed to create GMP");
        }
        const gmpData = await gmpRes.json();
        resolvedGmpId = gmpData.id;
      }

      if (!resolvedGmpId) throw new Error("Please select or create a GMP");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("customer_id", customerId);
      formData.append("gmp_id", resolvedGmpId);

      const res = await fetch("/api/bom/parse", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }

      const result = await res.json();
      router.push(`/bom/${result.bom_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  };

  const gmpReady = gmpId || (isNewGmp && newGmpNumber.trim().length > 0);

  return (
    <div className="space-y-6">
      {/* Customer */}
      <div className="space-y-2">
        <Label>Customer</Label>
        <Select value={customerId} onValueChange={handleCustomerChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a customer..." />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* GMP */}
      {customerId && (
        <div className="space-y-2">
          <Label>GMP (Board / Product)</Label>
          {gmps.length > 0 && !isNewGmp ? (
            <div className="flex gap-2">
              <Select value={gmpId} onValueChange={(v) => v && setGmpId(v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select existing GMP..." />
                </SelectTrigger>
                <SelectContent>
                  {gmps.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.gmp_number}
                      {g.board_name ? ` — ${g.board_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setIsNewGmp(true)}>
                New GMP
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="e.g. TL265-5040-000-T"
                value={newGmpNumber}
                onChange={(e) => setNewGmpNumber(e.target.value)}
                className="flex-1"
              />
              {gmps.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setIsNewGmp(false)}>
                  Existing
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* File drop zone */}
      {customerId && gmpReady && (
        <div
          className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : file
                ? "border-green-400 bg-green-50"
                : "border-gray-300 hover:border-gray-400"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet className="h-10 w-10 text-green-500" />
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-gray-400" />
              <p className="font-medium">Drag & drop a BOM file here</p>
              <p className="text-sm text-gray-500">Supports .xlsx, .xls, .csv</p>
              <label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button variant="outline" size="sm" type="button">
                  Browse files
                </Button>
              </label>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {file && (
        <Button onClick={handleUpload} disabled={uploading} className="w-full">
          {uploading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading &amp; Parsing...</>
          ) : (
            <><Upload className="mr-2 h-4 w-4" />Upload &amp; Parse BOM</>
          )}
        </Button>
      )}
    </div>
  );
}

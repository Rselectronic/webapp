"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import { Upload, FileSpreadsheet, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnMapper, type ColumnMapping } from "./column-mapper";
import * as XLSX from "xlsx";

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
  const [gmpInput, setGmpInput] = useState("");
  const [gmpDropdownOpen, setGmpDropdownOpen] = useState(false);
  const gmpWrapperRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bomName, setBomName] = useState("");
  const [revision, setRevision] = useState("1");
  const [gerberName, setGerberName] = useState("");
  const [gerberRevision, setGerberRevision] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Column mapper preview state
  const [allFileRows, setAllFileRows] = useState<(string | number | null)[][]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [showMapper, setShowMapper] = useState(false);
  // 1-indexed row numbers for the user
  const [headerRow, setHeaderRow] = useState(1);
  const [lastRow, setLastRow] = useState(1);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (gmpWrapperRef.current && !gmpWrapperRef.current.contains(e.target as Node)) {
        setGmpDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCustomerChange = useCallback(async (id: string | null) => {
    if (!id) return;
    setCustomerId(id);
    setGmpId("");
    setGmpInput("");
    setGmpDropdownOpen(false);
    setGmps([]);

    const res = await fetch(`/api/gmps?customer_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setGmps(data.gmps ?? []);
    }
  }, []);

  // Auto-detect keywords for column mapping (matches server-side column-mapper.ts)
  const AUTO_KEYWORDS: Record<string, string[]> = {
    qty: ["qty", "quantity", "qté", "count", "amount"],
    designator: ["designator", "designation", "ref des", "refdes", "reference", "index"],
    mpn: ["mpn", "manufacturer part", "part number", "mfr#", "partnumber", "mfg p/n", "p/n", "pn"],
    manufacturer: ["manufacturer", "mfg", "mfr", "vendor"],
    description: ["description", "desc", "name", "comment", "value", "spec"],
    cpc: ["cpc", "erp_pn", "customer part", "internal pn", "legend p/n", "fiso#"],
  };

  function autoDetectMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};
    const usedIndices = new Set<number>();
    const normalized = headers.map((h) => h.toLowerCase().trim());

    for (const [field, keywords] of Object.entries(AUTO_KEYWORDS)) {
      for (let i = 0; i < normalized.length; i++) {
        if (usedIndices.has(i)) continue;
        if (keywords.some((kw) => normalized[i].includes(kw))) {
          mapping[field] = headers[i];
          usedIndices.add(i);
          break;
        }
      }
    }
    return mapping;
  }

  /** Given all rows and a 0-indexed header position, compute headers + sample rows + auto-mapping */
  function computePreview(
    rows: (string | number | null)[][],
    headerIdx: number,
    endIdx?: number
  ) {
    const hdrs = (rows[headerIdx] ?? []).map((c) => String(c ?? "").trim());
    const dataEnd = endIdx ?? rows.length;
    const sampleEnd = Math.min(headerIdx + 6, dataEnd);
    const samples = rows
      .slice(headerIdx + 1, sampleEnd)
      .map((row) => hdrs.map((_, ci) => String(row[ci] ?? "").trim()));

    setPreviewHeaders(hdrs);
    setPreviewRows(samples);
    setColumnMapping(autoDetectMapping(hdrs));
  }

  function handleHeaderRowChange(row1: number) {
    setHeaderRow(row1);
    // Ensure last row stays >= header row + 1
    if (lastRow <= row1) setLastRow(Math.min(row1 + 1, allFileRows.length));
    computePreview(allFileRows, row1 - 1, lastRow);
  }

  function handleLastRowChange(row1: number) {
    setLastRow(row1);
    computePreview(allFileRows, headerRow - 1, row1);
  }

  async function readFilePreview(f: File) {
    try {
      const buffer = await f.arrayBuffer();
      const ext = f.name.split(".").pop()?.toLowerCase();
      let rows: (string | number | null)[][];

      if (ext === "csv" || ext === "tsv") {
        const text = new TextDecoder("utf-8").decode(buffer);
        rows = text
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => line.split(ext === "tsv" ? "\t" : ","));
      } else {
        const wb = XLSX.read(buffer, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
      }

      if (rows.length === 0) return;

      setAllFileRows(rows);

      // Auto-detect the header row (first row with 3+ non-empty text cells)
      let headerIdx = 0;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const textCells = (rows[i] ?? [])
          .map((c) => String(c ?? "").trim())
          .filter((s) => s.length > 1 && isNaN(Number(s)));
        if (textCells.length >= 3) {
          headerIdx = i;
          break;
        }
      }

      const detectedHeaderRow = headerIdx + 1; // 1-indexed
      setHeaderRow(detectedHeaderRow);
      setLastRow(rows.length);
      computePreview(rows, headerIdx, rows.length);
      setShowMapper(true);
    } catch {
      // If preview fails, still allow upload (server will handle parsing)
      setShowMapper(false);
    }
  }

  function handleFileSelected(f: File | null) {
    setFile(f);
    setBomName(f ? f.name : "");
    setShowMapper(false);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setColumnMapping({});
    setAllFileRows([]);
    setHeaderRow(1);
    setLastRow(1);
    if (f) void readFilePreview(f);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelected(dropped);
  }, []);

  // Filtered GMPs based on input text
  const filteredGmps = gmps.filter((g) => {
    if (!gmpInput.trim()) return true;
    const q = gmpInput.toLowerCase();
    return (
      g.gmp_number.toLowerCase().includes(q) ||
      (g.board_name && g.board_name.toLowerCase().includes(q))
    );
  });

  // Whether the input exactly matches an existing GMP (case-insensitive)
  const exactMatch = gmps.find(
    (g) => g.gmp_number.toLowerCase() === gmpInput.trim().toLowerCase()
  );

  const handleGmpSelect = (gmp: Gmp) => {
    setGmpId(gmp.id);
    setGmpInput(gmp.gmp_number);
    setGmpDropdownOpen(false);
  };

  const handleGmpInputChange = (value: string) => {
    setGmpInput(value);
    // If the user edits the text, clear the selected ID so we know it's a "new" GMP
    // unless the typed text exactly matches an existing GMP number
    const match = gmps.find(
      (g) => g.gmp_number.toLowerCase() === value.trim().toLowerCase()
    );
    if (match) {
      setGmpId(match.id);
    } else {
      setGmpId("");
    }
    setGmpDropdownOpen(true);
  };

  const handleUpload = async () => {
    if (!file || !customerId) return;
    setUploading(true);
    setError(null);

    try {
      let resolvedGmpId = gmpId;

      // If no existing GMP was selected, create a new one
      if (!resolvedGmpId && gmpInput.trim()) {
        const gmpRes = await fetch("/api/gmps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_id: customerId, gmp_number: gmpInput.trim() }),
        });
        if (gmpRes.status === 409) {
          // GMP already exists — look it up and use it (new BOM revision under existing GMP)
          const existingGmp = gmps.find(
            (g) => g.gmp_number.toLowerCase() === gmpInput.trim().toLowerCase()
          );
          if (existingGmp) {
            resolvedGmpId = existingGmp.id;
          } else {
            // Not in the loaded list — fetch it
            const lookupRes = await fetch(`/api/gmps?customer_id=${customerId}`);
            if (lookupRes.ok) {
              const lookupData = await lookupRes.json();
              const match = (lookupData.gmps ?? []).find(
                (g: { id: string; gmp_number: string }) =>
                  g.gmp_number.toLowerCase() === gmpInput.trim().toLowerCase()
              );
              if (match) resolvedGmpId = match.id;
            }
          }
          if (!resolvedGmpId) throw new Error("GMP exists but could not be found. Please try again.");
        } else if (!gmpRes.ok) {
          const err = await gmpRes.json();
          throw new Error(err.error ?? "Failed to create GMP");
        } else {
          const gmpData = await gmpRes.json();
          resolvedGmpId = gmpData.id;
        }
      }

      if (!resolvedGmpId) throw new Error("Please enter a GMP number");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("customer_id", customerId);
      formData.append("gmp_id", resolvedGmpId);
      formData.append("revision", revision.trim() || "1");
      if (bomName.trim()) formData.append("bom_name", bomName.trim());
      if (gerberName.trim()) formData.append("gerber_name", gerberName.trim());
      if (gerberRevision.trim()) formData.append("gerber_revision", gerberRevision.trim());
      // Send the user's column mapping so the server uses it instead of auto-detect
      if (Object.keys(columnMapping).length > 0) {
        formData.append("column_mapping", JSON.stringify(columnMapping));
      }
      // Always send header row and last row (1-indexed) when the column mapper was shown.
      // This overrides the customer's bom_config header detection (e.g. TLAN has columns_fixed
      // which tells the server "no header row" — but the file might actually have one).
      if (showMapper && headerRow >= 1) {
        formData.append("header_row", String(headerRow));
        formData.append("last_row", String(lastRow));
      }

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

  const gmpReady = gmpId || gmpInput.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Customer */}
      <div className="space-y-2">
        <Label>Customer</Label>
        <Select value={customerId} onValueChange={handleCustomerChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a customer...">
              {customerId ? (() => { const c = customers.find(c => c.id === customerId); return c ? `${c.code} — ${c.company_name}` : customerId; })() : undefined}
            </SelectValue>
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
          <div className="relative" ref={gmpWrapperRef}>
            <Input
              placeholder={gmps.length > 0 ? "Type to search or enter new GMP..." : "e.g. TL265-5040-000-T"}
              value={gmpInput}
              onChange={(e) => handleGmpInputChange(e.target.value)}
              onFocus={() => { if (gmps.length > 0) setGmpDropdownOpen(true); }}
              autoComplete="off"
            />
            {/* Dropdown list */}
            {gmpDropdownOpen && gmps.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                <div className="max-h-48 overflow-y-auto p-1">
                  {filteredGmps.length > 0 ? (
                    filteredGmps.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors",
                          gmpId === g.id && "bg-muted"
                        )}
                        onMouseDown={(e) => {
                          // Use mousedown to fire before input blur
                          e.preventDefault();
                          handleGmpSelect(g);
                        }}
                      >
                        <Check className={cn("h-3.5 w-3.5 shrink-0", gmpId === g.id ? "opacity-100" : "opacity-0")} />
                        <span className="font-medium">{g.gmp_number}</span>
                        {g.board_name && <span className="text-muted-foreground truncate">— {g.board_name}</span>}
                      </button>
                    ))
                  ) : (
                    <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                      No matching GMPs — press Upload to create <span className="font-medium">{gmpInput.trim()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Hint text below input */}
            {gmpInput.trim() && !gmpId && !exactMatch && (
              <p className="mt-1 text-xs text-muted-foreground">
                New GMP will be created: <span className="font-medium">{gmpInput.trim()}</span>
              </p>
            )}
          </div>

          {/* Revision / Version number — required so we track which BOM version the customer sent */}
          <div>
            <Label htmlFor="bom-revision">BOM Revision / Version</Label>
            <Input
              id="bom-revision"
              type="text"
              value={revision}
              onChange={(e) => setRevision(e.target.value)}
              placeholder="e.g. 1, V5, Rev A, 2.1"
              className="max-w-[240px]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Extract from the customer&apos;s filename (e.g. <span className="font-mono">_V5</span>,
              <span className="font-mono"> Rev3</span>) or ask them. Each revision is stored as a separate BOM under the same GMP.
            </p>
          </div>
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
              <Button variant="ghost" size="sm" onClick={() => handleFileSelected(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-gray-400" />
              <p className="font-medium">Drag & drop a BOM file here</p>
              <p className="text-sm text-gray-500">Supports .xlsx, .xls, .csv</p>
              <div>
                <input
                  id="bom-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => document.getElementById("bom-file-input")?.click()}
                >
                  Browse files
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOM Name + Gerber fields — shown after file is selected */}
      {file && (
        <div className="space-y-3 rounded-lg border p-4 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
          <div>
            <Label htmlFor="bom-name">BOM Name</Label>
            <Input
              id="bom-name"
              type="text"
              value={bomName}
              onChange={(e) => setBomName(e.target.value)}
              placeholder={file.name}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Defaults to the uploaded filename. Edit if you want a cleaner display name.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="gerber-name">Gerber Name</Label>
              <Input
                id="gerber-name"
                type="text"
                value={gerberName}
                onChange={(e) => setGerberName(e.target.value)}
                placeholder="e.g. TL265-5001-000-T_Gerber"
              />
            </div>
            <div>
              <Label htmlFor="gerber-revision">Gerber Revision</Label>
              <Input
                id="gerber-revision"
                type="text"
                value={gerberRevision}
                onChange={(e) => setGerberRevision(e.target.value)}
                placeholder="e.g. V3, Rev A"
              />
            </div>
          </div>
        </div>
      )}

      {/* Column mapper preview */}
      {showMapper && previewHeaders.length > 0 && (
        <ColumnMapper
          headers={previewHeaders}
          sampleRows={previewRows}
          mapping={columnMapping}
          onMappingChange={setColumnMapping}
          headerRow={headerRow}
          lastRow={lastRow}
          totalRows={allFileRows.length}
          onHeaderRowChange={handleHeaderRowChange}
          onLastRowChange={handleLastRowChange}
        />
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

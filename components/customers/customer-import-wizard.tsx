"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Field definitions ─────────────────────────────────────────────────────────
type FieldKey =
  | "code"
  | "company_name"
  | "folder_name"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "contact_role"
  | "billing_address_line1"
  | "billing_city"
  | "billing_province"
  | "billing_postal"
  | "billing_country"
  | "shipping_address_line1"
  | "shipping_city"
  | "shipping_province"
  | "shipping_postal"
  | "shipping_country"
  | "payment_terms"
  | "notes";

const FIELDS: { key: FieldKey; label: string; required?: boolean; matchers: string[] }[] = [
  { key: "code", label: "Code", required: true, matchers: ["code", "customer code", "custcode"] },
  { key: "company_name", label: "Company name", required: true, matchers: ["company name", "company", "customer name", "customer"] },
  { key: "folder_name", label: "Folder name", matchers: ["folder", "folder name", "directory"] },
  { key: "contact_name", label: "Contact name", matchers: ["contact name", "contact", "name"] },
  { key: "contact_email", label: "Contact email", matchers: ["contact email", "email"] },
  { key: "contact_phone", label: "Contact phone", matchers: ["phone", "telephone", "tel"] },
  { key: "contact_role", label: "Contact role", matchers: ["role", "title", "position", "contact role"] },
  { key: "billing_address_line1", label: "Billing address", matchers: ["billing address", "bill address", "address", "street"] },
  { key: "billing_city", label: "Billing city", matchers: ["billing city", "bill city", "city", "town"] },
  { key: "billing_province", label: "Billing province / state", matchers: ["billing province", "billing state", "bill state", "province", "state"] },
  { key: "billing_postal", label: "Billing postal / ZIP", matchers: ["billing postal", "billing zip", "bill zip", "postal code", "postal", "zip"] },
  { key: "billing_country", label: "Billing country", matchers: ["billing country", "bill country", "country"] },
  { key: "shipping_address_line1", label: "Shipping address", matchers: ["shipping address", "ship address", "ship to"] },
  { key: "shipping_city", label: "Shipping city", matchers: ["ship city", "shipping city"] },
  { key: "shipping_province", label: "Shipping province / state", matchers: ["ship state", "ship province", "shipping state", "shipping province"] },
  { key: "shipping_postal", label: "Shipping postal / ZIP", matchers: ["ship postal", "ship zip", "shipping zip", "shipping postal"] },
  { key: "shipping_country", label: "Shipping country", matchers: ["ship country", "shipping country"] },
  { key: "payment_terms", label: "Payment terms", matchers: ["payment terms", "terms", "net"] },
  { key: "notes", label: "Notes", matchers: ["notes", "comments", "remark"] },
];

const SKIP = "__skip__";

type Mapping = Record<FieldKey, string>; // value = header name or SKIP

interface AddressEntry {
  label: string;
  is_default: boolean;
  street?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
}

interface ContactEntry {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  is_primary?: boolean;
}

interface ValidRow {
  code: string;
  company_name: string;
  folder_name?: string;
  contacts: ContactEntry[];
  billing_addresses: AddressEntry[];
  shipping_addresses: AddressEntry[];
  payment_terms?: string;
  notes?: string;
}

// ── Parse paste / xlsx into headers + rows ────────────────────────────────────
function autoMap(headers: string[]): Mapping {
  const m = {} as Mapping;
  const used = new Set<string>();
  for (const f of FIELDS) {
    const found = headers.find((h) => {
      if (used.has(h)) return false;
      const hl = h.toLowerCase();
      return f.matchers.some((mt) => hl.includes(mt));
    });
    m[f.key] = found ?? SKIP;
    if (found) used.add(found);
  }
  return m;
}

// Build a single address entry from a row using the given prefix.
function buildAddress(
  get: (k: FieldKey) => string,
  prefix: "billing" | "shipping",
): AddressEntry | null {
  const street = get(`${prefix}_address_line1` as FieldKey);
  const city = get(`${prefix}_city` as FieldKey);
  const province = get(`${prefix}_province` as FieldKey);
  const postal = get(`${prefix}_postal` as FieldKey);
  const country = get(`${prefix}_country` as FieldKey);
  const entry: AddressEntry = { label: "", is_default: true };
  // Use `street` to match the customer-edit form's address shape (it expects
  // `street`, not `line1`). Older imports wrote `line1` and stayed invisible.
  if (street) entry.street = street;
  if (city) entry.city = city;
  if (province) entry.province = province;
  if (postal) entry.postal_code = postal;
  if (country) entry.country = country;
  const hasContent = !!(street || city || province || postal || country);
  return hasContent ? entry : null;
}

// Build a single contact entry from a row. Returns null if all fields empty.
function buildContact(get: (k: FieldKey) => string): ContactEntry | null {
  const name = get("contact_name");
  const email = get("contact_email");
  const phone = get("contact_phone");
  const role = get("contact_role");
  if (!name && !email && !phone) return null;
  const c: ContactEntry = {};
  if (name) c.name = name;
  if (email) c.email = email;
  if (phone) c.phone = phone;
  if (role) c.role = role;
  return c;
}

// Build rows + aggregate by code (multiple rows per code merge addresses + contacts).
function buildValidRows(
  headers: string[],
  rows: string[][],
  mapping: Mapping,
): { valid: ValidRow[]; skippedIdx: Set<number> } {
  const idx = (h: string) => headers.indexOf(h);
  const skippedIdx = new Set<number>();
  const byCode = new Map<string, ValidRow>();

  rows.forEach((r, i) => {
    const get = (k: FieldKey): string => {
      const h = mapping[k];
      if (!h || h === SKIP) return "";
      const j = idx(h);
      return j >= 0 ? (r[j] ?? "").toString().trim() : "";
    };
    const code = get("code").toUpperCase();
    const company = get("company_name");
    if (!code || !company) {
      skippedIdx.add(i);
      return;
    }
    const billing = buildAddress(get, "billing");
    const shipping = buildAddress(get, "shipping");
    const contact = buildContact(get);

    let row = byCode.get(code);
    if (!row) {
      row = { code, company_name: company, contacts: [], billing_addresses: [], shipping_addresses: [] };
      const fn = get("folder_name");
      if (fn) row.folder_name = fn;
      const pt = get("payment_terms");
      if (pt) row.payment_terms = pt;
      const nt = get("notes");
      if (nt) row.notes = nt;
      byCode.set(code, row);
    }
    if (billing) row.billing_addresses.push(billing);
    if (shipping) row.shipping_addresses.push(shipping);
    if (contact) row.contacts.push(contact);
  });

  // Finalize addresses — dedupe + sequential labels + first is_default.
  const finalizeAddrs = (entries: AddressEntry[]): AddressEntry[] => {
    const seen = new Set<string>();
    const out: AddressEntry[] = [];
    for (const e of entries) {
      const key = `${(e.street ?? "").toLowerCase()}|${(e.city ?? "").toLowerCase()}|${(e.postal_code ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = out.length === 0 ? "Primary" : `Primary ${out.length + 1}`;
      out.push({ ...e, label, is_default: out.length === 0 });
    }
    return out;
  };

  // Finalize contacts — dedupe by email||name; first is_primary=true.
  const finalizeContacts = (entries: ContactEntry[]): ContactEntry[] => {
    const seen = new Set<string>();
    const out: ContactEntry[] = [];
    for (const e of entries) {
      const key = (e.email?.toLowerCase() || e.name?.toLowerCase() || "").trim();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...e, is_primary: out.length === 0 });
    }
    return out;
  };

  const valid: ValidRow[] = [];
  for (const row of byCode.values()) {
    row.billing_addresses = finalizeAddrs(row.billing_addresses);
    row.shipping_addresses = finalizeAddrs(row.shipping_addresses);
    row.contacts = finalizeContacts(row.contacts);
    valid.push(row);
  }
  return { valid, skippedIdx };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CustomerImportWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({} as Mapping);
  const [mode, setMode] = useState<"insert" | "upsert">("insert");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    errors: { index: number; message: string }[];
  } | null>(null);

  const applyParsed = (h: string[], r: string[][]) => {
    setHeaders(h);
    setRows(r);
    setMapping(autoMap(h));
  };

  // Build & download an .xlsx template. Same field set the importer recognises.
  const downloadTemplate = () => {
    const headers = [
      "Code",
      "Company Name",
      "Folder Name",
      "Contact Name",
      "Contact Email",
      "Contact Phone",
      "Contact Role",
      "Billing Address",
      "Billing City",
      "Billing Province",
      "Billing Postal",
      "Billing Country",
      "Shipping Address",
      "Shipping City",
      "Shipping Province",
      "Shipping Postal",
      "Shipping Country",
      "Payment Terms",
      "Notes",
    ];
    // Sample rows showing multi-row aggregation: same code → extra address AND extra contact.
    const sample = [
      [
        "TLAN",
        "Lanka / Knorr-Bremse",
        "Lanka",
        "Luis Esqueda",
        "luis.esqueda@example.com",
        "+1-555-0100",
        "Buyer",
        "1234 Sample St",
        "Saint-Laurent",
        "QC",
        "H4S 1P9",
        "Canada",
        "1234 Sample St",
        "Saint-Laurent",
        "QC",
        "H4S 1P9",
        "Canada",
        "Net 30",
        "First example row",
      ],
      [
        "TLAN",
        "Lanka / Knorr-Bremse",
        "",
        "Marie Tremblay",
        "marie.t@example.com",
        "+1-555-0101",
        "AP / Accounting",
        "999 Another Ave",
        "Montreal",
        "QC",
        "H3B 0B0",
        "Canada",
        "",
        "",
        "",
        "",
        "",
        "",
        "Same Code = additional address AND additional contact for TLAN",
      ],
    ];
    const aoa: unknown[][] = [headers, ...sample];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, "customer-import-template.xlsx");
  };

  const handleFileUpload = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
    if (aoa.length === 0) {
      applyParsed([], []);
      return;
    }
    const h = (aoa[0] as unknown[]).map((c) => String(c ?? "").trim());
    const r = aoa.slice(1).map((row) => (row as unknown[]).map((c) => String(c ?? "").trim()));
    const filtered = r.filter((row) => row.some((c) => c.length > 0));
    applyParsed(h, filtered);
  };

  const sourceReady = headers.length > 0 && rows.length > 0;

  const codeMapped = mapping.code && mapping.code !== SKIP;
  const companyMapped = mapping.company_name && mapping.company_name !== SKIP;
  const mappingValid = !!codeMapped && !!companyMapped;

  const preview = useMemo(() => {
    if (!mappingValid) return { valid: [], skippedIdx: new Set<number>() };
    return buildValidRows(headers, rows, mapping);
  }, [headers, rows, mapping, mappingValid]);

  const handleImport = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.valid, mode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult({ inserted: 0, updated: 0, skipped: 0, errors: [{ index: -1, message: json.error ?? "Import failed" }] });
      } else {
        setResult(json);
      }
    } catch (e) {
      setResult({ inserted: 0, updated: 0, skipped: 0, errors: [{ index: -1, message: e instanceof Error ? e.message : "Network error" }] });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setHeaders([]);
    setRows([]);
    setMapping({} as Mapping);
    setMode("insert");
    setResult(null);
  };

  if (result) {
    return (
      <Card className="p-6 space-y-4">
        <h3 className="text-lg font-semibold">Import complete</h3>
        <div className="flex gap-3">
          <Badge variant="default">Imported {result.inserted}</Badge>
          <Badge variant="secondary">Updated {result.updated}</Badge>
          <Badge variant="outline">Skipped {result.skipped}</Badge>
        </div>
        {result.errors.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            <div className="font-medium mb-1">Errors:</div>
            <ul className="list-disc pl-5">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {e.index >= 0 ? `Row ${e.index + 1}: ` : ""}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <a href="/customers"><Button>View customers</Button></a>
          <Button variant="outline" onClick={reset}>Import more</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className={step === 1 ? "font-semibold text-foreground" : ""}>1. Source</span>
        <span>›</span>
        <span className={step === 2 ? "font-semibold text-foreground" : ""}>2. Map columns</span>
        <span>›</span>
        <span className={step === 3 ? "font-semibold text-foreground" : ""}>3. Preview & import</span>
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-4">
          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Step 1: Download the template, fill it in, then upload.</p>
            <p className="mt-1 text-gray-500">
              The template lists every supported column. Required: <strong>Code</strong> and{" "}
              <strong>Company Name</strong>. Repeat the same <strong>Code</strong> on additional
              rows to add more billing/shipping addresses AND more contacts to the same customer.
            </p>
            <Button
              onClick={downloadTemplate}
              variant="outline"
              size="sm"
              className="mt-3"
            >
              Download template (.xlsx)
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Upload filled-in template (.xlsx)</Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
            />
          </div>

          {sourceReady && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              Detected <strong>{headers.length}</strong> columns and <strong>{rows.length}</strong> data row{rows.length === 1 ? "" : "s"}.
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!sourceReady}>
              Next
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Map columns</h3>
          <p className="text-sm text-gray-500">
            We auto-matched what we recognized. Confirm or override each mapping below.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map((f) => {
              const isUnmappedRequired = f.required && (!mapping[f.key] || mapping[f.key] === SKIP);
              return (
                <div key={f.key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>{f.label}</Label>
                    {f.required && <Badge variant="outline" className="text-xs">Required</Badge>}
                  </div>
                  <Select
                    value={mapping[f.key] ?? SKIP}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [f.key]: v ?? SKIP }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => (v === SKIP ? "— skip —" : v)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>— skip —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isUnmappedRequired && (
                    <p className="text-xs text-red-600">This field is required.</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 border-t pt-4">
            <Label className="text-sm">Mode:</Label>
            <Button
              size="sm"
              variant={mode === "insert" ? "default" : "outline"}
              onClick={() => setMode("insert")}
            >
              Insert only
            </Button>
            <Button
              size="sm"
              variant={mode === "upsert" ? "default" : "outline"}
              onClick={() => setMode("upsert")}
            >
              Upsert by code
            </Button>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)} disabled={!mappingValid}>Next</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="default">{preview.valid.length} valid</Badge>
            <Badge variant="outline">{preview.skippedIdx.size} will skip</Badge>
            <span className="text-sm text-gray-500">Mode: {mode}</span>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Shipping</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.valid.slice(0, 50).map((v, i) => (
                  <TableRow key={v.code}>
                    <TableCell>
                      <span className="text-xs text-gray-400">{i + 1}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{v.code}</TableCell>
                    <TableCell>{v.company_name}</TableCell>
                    <TableCell className="text-xs">Contacts ({v.contacts.length})</TableCell>
                    <TableCell className="text-xs">Billing addresses ({v.billing_addresses.length})</TableCell>
                    <TableCell className="text-xs">Shipping addresses ({v.shipping_addresses.length})</TableCell>
                    <TableCell>{v.payment_terms ?? ""}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{v.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {preview.valid.length > 50 && (
            <p className="text-xs text-gray-500">Showing first 50 of {preview.valid.length} customers.</p>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>Back</Button>
            <Button onClick={handleImport} disabled={submitting || preview.valid.length === 0}>
              {submitting ? "Importing…" : `Import ${preview.valid.length} customer${preview.valid.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

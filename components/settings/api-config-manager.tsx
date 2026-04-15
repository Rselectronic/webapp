"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Check,
  X,
  Plug,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CredentialStatus } from "@/lib/supplier-credentials";

type Field = CredentialStatus["fields"][number];
type FieldType = "text" | "password" | "select";

const STANDARD_CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CHF",
  "CNY",
  "MXN",
  "PLN",
  "SEK",
  "INR",
  "BRL",
  "CZK",
  "SGD",
  "HKD",
];

const BUILT_IN_NAMES = new Set([
  "digikey",
  "mouser",
  "lcsc",
  "future",
  "avnet",
  "arrow",
  "tti",
  "esonic",
  "newark",
  "samtec",
  "ti",
  "tme",
]);

function validateCustomName(name: string): string | null {
  if (!name) return "Name is required";
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
    return "Lowercase letters, numbers, hyphens, underscores. Must start with a letter.";
  }
  if (BUILT_IN_NAMES.has(name)) {
    return "This name is reserved for a built-in distributor.";
  }
  return null;
}

function validateFieldKey(key: string): string | null {
  if (!key) return "Required";
  if (!/^[a-z][a-z0-9_]*$/.test(key)) return "Lowercase + underscores only";
  return null;
}

interface DraftField {
  key: string;
  label: string;
  type: FieldType;
}

interface ApiConfigManagerProps {
  initialSuppliers: CredentialStatus[];
}

function maskValue(v: string): string {
  if (v.length <= 8) return "•".repeat(v.length);
  return v.slice(0, 4) + "•".repeat(Math.min(v.length - 8, 16)) + v.slice(-4);
}

function buildPreview(
  fields: Field[],
  data: Record<string, string>
): Record<string, string> {
  const p: Record<string, string> = {};
  for (const f of fields) {
    if (data[f.key])
      p[f.key] = f.type === "password" ? maskValue(data[f.key]) : data[f.key];
  }
  return p;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

// Per-distributor default test MPN — matches what lib/supplier-tests.ts
// falls back to when no override is supplied. Used as placeholder text
// in the expanded panel test input.
const DEFAULT_TEST_MPN: Record<string, string> = {
  lcsc: "C2665711",
  samtec: "IPL1-110-01-S-D",
  ti: "AFE7799IABJ",
};
const FALLBACK_TEST_MPN = "ERJ-2GE0R00X";

function getDefaultMpn(supplier: string): string {
  return DEFAULT_TEST_MPN[supplier] ?? FALLBACK_TEST_MPN;
}

type TestResult = {
  type: "success" | "error";
  message: string;
  raw_response?: unknown;
  status_code?: number;
  request_url?: string;
};

// Aggregated bulk-test response from POST /api/admin/supplier-credentials/test-all
interface BulkTestRow {
  supplier: string;
  display_name: string;
  ok: boolean;
  message: string;
  status_code?: number;
  request_url?: string;
  duration_ms: number;
}
interface BulkTestResults {
  mpn: string | null;
  results: BulkTestRow[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    not_configured: number;
    duration_ms: number;
  };
}

function truncate(str: string, max = 40): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

export function ApiConfigManager({ initialSuppliers }: ApiConfigManagerProps) {
  const [suppliers, setSuppliers] = useState<CredentialStatus[]>(
    [...initialSuppliers].sort((a, b) =>
      a.display_name.localeCompare(b.display_name)
    )
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<
    Record<string, Record<string, string>>
  >({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {}
  );
  const [currencySaving, setCurrencySaving] = useState<Record<string, boolean>>(
    {}
  );
  const [deletingCustom, setDeletingCustom] = useState<Record<string, boolean>>(
    {}
  );
  // Per-supplier MPN override typed into the expanded-panel test input.
  // Empty/missing → default is sent (handled server-side).
  const [testMpns, setTestMpns] = useState<Record<string, string>>({});

  // Bulk "Test All Distributors" state — drives the card at the top of
  // the page. Independent from the per-row testing state above.
  const [bulkMpn, setBulkMpn] = useState("");
  const [bulkTesting, setBulkTesting] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkTestResults | null>(null);

  // Add Distributor dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addDocsUrl, setAddDocsUrl] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addDefaultCurrency, setAddDefaultCurrency] = useState("USD");
  const [addSupportedCurrencies, setAddSupportedCurrencies] = useState<
    string[]
  >(["USD"]);
  const [addFields, setAddFields] = useState<DraftField[]>([
    { key: "api_key", label: "API Key", type: "password" },
  ]);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const configuredCount = suppliers.filter((s) => s.configured).length;
  const totalCount = suppliers.length;

  // Live validation for the Add Distributor form
  const addNameError = validateCustomName(addName);
  const addDisplayNameError = addDisplayName.trim() ? null : "Required";
  const addCurrenciesError =
    addSupportedCurrencies.length === 0 ? "Select at least one" : null;
  const addDefaultCurrencyError = addSupportedCurrencies.includes(
    addDefaultCurrency
  )
    ? null
    : "Must be in supported currencies";

  const fieldKeyErrors = addFields.map((f) => validateFieldKey(f.key));
  const fieldLabelErrors = addFields.map((f) =>
    f.label.trim() ? null : "Required"
  );
  const duplicateKeys = new Set<string>();
  {
    const seen = new Set<string>();
    for (const f of addFields) {
      if (f.key && seen.has(f.key)) duplicateKeys.add(f.key);
      if (f.key) seen.add(f.key);
    }
  }
  const addFieldsError =
    addFields.length === 0
      ? "Add at least one credential field"
      : fieldKeyErrors.some((e) => e) || fieldLabelErrors.some((e) => e)
        ? "Fix field errors above"
        : duplicateKeys.size > 0
          ? "Field keys must be unique"
          : null;

  const addFormValid =
    !addNameError &&
    !addDisplayNameError &&
    !addCurrenciesError &&
    !addDefaultCurrencyError &&
    !addFieldsError;

  const resetAddForm = () => {
    setAddName("");
    setAddDisplayName("");
    setAddDocsUrl("");
    setAddNotes("");
    setAddDefaultCurrency("USD");
    setAddSupportedCurrencies(["USD"]);
    setAddFields([{ key: "api_key", label: "API Key", type: "password" }]);
    setAddSubmitting(false);
    setAddError(null);
  };

  const handleAddDialogOpenChange = (open: boolean) => {
    setAddDialogOpen(open);
    if (!open) {
      setTimeout(resetAddForm, 150);
    }
  };

  const toggleSupportedCurrency = (cur: string) => {
    setAddSupportedCurrencies((prev) => {
      if (prev.includes(cur)) return prev.filter((c) => c !== cur);
      return [...prev, cur];
    });
  };

  const updateDraftField = (
    idx: number,
    patch: Partial<DraftField>
  ) => {
    setAddFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f))
    );
  };

  const addDraftField = () => {
    setAddFields((prev) => [...prev, { key: "", label: "", type: "text" }]);
  };

  const removeDraftField = (idx: number) => {
    setAddFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitAddDistributor = async () => {
    if (!addFormValid) return;
    setAddSubmitting(true);
    setAddError(null);
    try {
      const body = {
        name: addName.trim(),
        display_name: addDisplayName.trim(),
        fields: addFields.map((f) => ({
          key: f.key.trim(),
          label: f.label.trim(),
          type: f.type,
          required: true,
        })),
        supported_currencies: addSupportedCurrencies,
        default_currency: addDefaultCurrency,
        docs_url: addDocsUrl.trim() || undefined,
        notes: addNotes.trim() || undefined,
      };
      const res = await fetch(
        "/api/admin/supplier-credentials/custom",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to create distributor");
      }

      // Build a local CredentialStatus entry so the new row appears right away
      const newEntry: CredentialStatus = {
        supplier: body.name,
        display_name: body.display_name,
        configured: false,
        preferred_currency: null,
        default_currency: body.default_currency,
        supported_currencies: body.supported_currencies,
        preview: {},
        updated_at: null,
        fields: body.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: true,
        })),
        docs_url: body.docs_url ?? "",
        notes: body.notes,
        is_custom: true,
      };

      setSuppliers((prev) =>
        [...prev, newEntry].sort((a, b) =>
          a.display_name.localeCompare(b.display_name)
        )
      );
      // Auto-expand the new row so user can immediately enter credentials
      setExpanded((p) => ({ ...p, [body.name]: true }));
      setFormData((p) => ({ ...p, [body.name]: {} }));

      toast.success(`${body.display_name} added`);
      handleAddDialogOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setAddError(msg);
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleDeleteCustom = async (s: CredentialStatus) => {
    const confirmed = window.confirm(
      `Delete "${s.display_name}" and its credentials? This cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingCustom((p) => ({ ...p, [s.supplier]: true }));
    try {
      const res = await fetch(
        `/api/admin/supplier-credentials/custom/${encodeURIComponent(s.supplier)}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to delete distributor");
      }
      setSuppliers((prev) => prev.filter((x) => x.supplier !== s.supplier));
      setExpanded((p) => {
        const { [s.supplier]: _u, ...rest } = p;
        void _u;
        return rest;
      });
      toast.success(`${s.display_name} deleted`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setDeletingCustom((p) => ({ ...p, [s.supplier]: false }));
    }
  };

  const toggleExpand = (supplier: string) => {
    setExpanded((p) => ({ ...p, [supplier]: !p[supplier] }));
    if (!formData[supplier]) {
      setFormData((p) => ({ ...p, [supplier]: {} }));
    }
  };

  const updateField = (supplier: string, key: string, value: string) => {
    setFormData((p) => ({
      ...p,
      [supplier]: { ...(p[supplier] ?? {}), [key]: value },
    }));
  };

  const showResult = (supplier: string, result: TestResult) => {
    // Auto-clear is intentionally removed — the CEO needs to actually read
    // the JSON response, so results persist until manually dismissed.
    setTestResults((p) => ({ ...p, [supplier]: result }));
  };

  const dismissResult = (supplier: string) => {
    setTestResults((p) => {
      const { [supplier]: _unused, ...rest } = p;
      void _unused;
      return rest;
    });
  };

  const handleSave = async (s: CredentialStatus) => {
    const supplier = s.supplier;
    const raw = formData[supplier] ?? {};

    // Build body: drop blank values so we don't overwrite stored secrets.
    const body: Record<string, string> = {};
    for (const f of s.fields) {
      const val = raw[f.key];
      if (val === undefined) continue;
      const trimmed = f.type === "password" ? val : val.trim();
      if (!trimmed) continue;
      body[f.key] = trimmed;
    }

    // In "create" mode (not yet configured), enforce required fields.
    if (!s.configured) {
      const missing = s.fields.filter(
        (f) => f.required && !body[f.key]
      );
      if (missing.length > 0) {
        toast.error(
          `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.map((m) => m.label).join(", ")}`
        );
        return;
      }
    }

    setSaving((p) => ({ ...p, [supplier]: true }));
    try {
      const res = await fetch(`/api/admin/supplier-credentials/${supplier}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: body,
          preferred_currency: s.preferred_currency ?? s.default_currency,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ?? "Failed to save credentials"
        );
      }

      const newlyMasked = buildPreview(s.fields, body);
      const mergedPreview: Record<string, string> = {
        ...(s.configured ? s.preview : {}),
        ...newlyMasked,
      };

      setSuppliers((prev) =>
        prev.map((x) =>
          x.supplier === supplier
            ? {
                ...x,
                configured: true,
                preview: mergedPreview,
                updated_at: new Date().toISOString(),
              }
            : x
        )
      );
      // Clear the form so "leave blank" UX works on next open
      setFormData((p) => ({ ...p, [supplier]: {} }));
      toast.success(`${s.display_name} credentials saved`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setSaving((p) => ({ ...p, [supplier]: false }));
    }
  };

  const handleCurrencyChange = async (
    s: CredentialStatus,
    newCurrency: string
  ) => {
    const supplier = s.supplier;
    const previous = s.preferred_currency;
    setSuppliers((prev) =>
      prev.map((x) =>
        x.supplier === supplier ? { ...x, preferred_currency: newCurrency } : x
      )
    );
    setCurrencySaving((p) => ({ ...p, [supplier]: true }));
    try {
      const res = await fetch(`/api/admin/supplier-credentials/${supplier}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_currency: newCurrency }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? "Failed to update currency"
        );
      }
    } catch (err) {
      setSuppliers((prev) =>
        prev.map((x) =>
          x.supplier === supplier ? { ...x, preferred_currency: previous } : x
        )
      );
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setCurrencySaving((p) => ({ ...p, [supplier]: false }));
    }
  };

  const handleBulkTest = async () => {
    setBulkTesting(true);
    try {
      const payload: Record<string, string> = {};
      const trimmed = bulkMpn.trim();
      if (trimmed) payload.mpn = trimmed;
      const res = await fetch(
        "/api/admin/supplier-credentials/test-all",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json().catch(() => null)) as
        | BulkTestResults
        | { error?: string }
        | null;
      if (!res.ok || !json || "error" in json) {
        const msg =
          json && "error" in json && json.error
            ? json.error
            : `HTTP ${res.status}`;
        toast.error(`Bulk test failed: ${msg}`);
        return;
      }
      setBulkResults(json as BulkTestResults);
      const { summary } = json as BulkTestResults;
      if (summary.failed === 0) {
        toast.success(
          `All ${summary.succeeded} distributors passed in ${(summary.duration_ms / 1000).toFixed(1)}s`
        );
      } else {
        toast.warning(
          `${summary.succeeded}/${summary.total} passed — ${summary.failed} failed`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Bulk test error: ${msg}`);
    } finally {
      setBulkTesting(false);
    }
  };

  const handleTest = async (s: CredentialStatus, mpnOverride?: string) => {
    const supplier = s.supplier;
    setTesting((p) => ({ ...p, [supplier]: true }));
    setTestResults((p) => {
      const { [supplier]: _unused, ...rest } = p;
      void _unused;
      return rest;
    });
    const trimmed = mpnOverride?.trim();
    const bodyPayload: Record<string, string> = {};
    if (trimmed) bodyPayload.mpn = trimmed;
    try {
      const res = await fetch(
        `/api/admin/supplier-credentials/${supplier}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        details?: unknown;
        raw_response?: unknown;
        status_code?: number;
        request_url?: string;
      };
      if (json.ok) {
        const detailStr =
          json.details && typeof json.details === "object"
            ? Object.entries(json.details as Record<string, unknown>)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")
            : "";
        const detailSuffix = detailStr ? ` — ${detailStr}` : "";
        showResult(supplier, {
          type: "success",
          message: json.message ?? `Connected${detailSuffix}`,
          raw_response: json.raw_response,
          status_code: json.status_code,
          request_url: json.request_url,
        });
      } else {
        showResult(supplier, {
          type: "error",
          message: json.message ?? "Connection failed",
          raw_response: json.raw_response,
          status_code: json.status_code,
          request_url: json.request_url,
        });
      }
      // If there's a raw_response to show, auto-expand the row so the user
      // can immediately see the JSON viewer without hunting for chevron-down.
      if (json.raw_response !== undefined) {
        setExpanded((p) => ({ ...p, [supplier]: true }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showResult(supplier, { type: "error", message: msg });
    } finally {
      setTesting((p) => ({ ...p, [supplier]: false }));
    }
  };

  const bulkSummaryTone = bulkResults
    ? bulkResults.summary.failed === 0
      ? "text-green-600 dark:text-green-400"
      : bulkResults.summary.failed * 2 > bulkResults.summary.total
        ? "text-red-600 dark:text-red-400"
        : "text-amber-600 dark:text-amber-400"
    : "";

  return (
    <div className="space-y-6">
      {/* Bulk-test card — fires a single MPN across every configured
          distributor in parallel so the CEO doesn't click 12 buttons
          one at a time. Does NOT replace the per-row Test buttons; both
          workflows coexist. */}
      <Card>
        <CardHeader>
          <CardTitle>Test All Distributors</CardTitle>
          <p className="text-sm text-gray-500">
            Fire a single MPN across every configured distributor and see
            which ones return real data.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder={FALLBACK_TEST_MPN}
              value={bulkMpn}
              onChange={(e) => setBulkMpn(e.target.value)}
              disabled={bulkTesting}
              className="sm:max-w-xs"
              aria-label="MPN to test across all distributors"
            />
            <Button
              onClick={handleBulkTest}
              disabled={bulkTesting}
              className="gap-1.5"
            >
              {bulkTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              Run All Tests
            </Button>
          </div>

          {bulkResults && (
            <>
              <div className={"text-sm font-medium " + bulkSummaryTone}>
                Last run: {(bulkResults.summary.duration_ms / 1000).toFixed(1)}s
                {" • "}
                {bulkResults.summary.succeeded}/{bulkResults.summary.total}{" "}
                succeeded
                {" • "}
                {bulkResults.summary.failed} failed
                {" • "}
                {bulkResults.summary.not_configured} n/c
                {bulkResults.mpn && (
                  <span className="text-gray-500 font-normal">
                    {" "}
                    · MPN: {bulkResults.mpn}
                  </span>
                )}
              </div>

              {bulkResults.results.length === 0 ? (
                <p className="text-sm text-gray-500 italic">
                  No distributors configured. Add credentials below to run bulk
                  tests.
                </p>
              ) : (
                <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/40 text-left">
                      <tr className="border-b border-gray-200 dark:border-gray-800">
                        <th className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                          Distributor
                        </th>
                        <th className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                          Result
                        </th>
                        <th className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300 w-20">
                          Status
                        </th>
                        <th className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300 w-24">
                          Duration
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {bulkResults.results.map((row) => (
                        <tr
                          key={row.supplier}
                          className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30"
                        >
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                            {row.display_name}
                          </td>
                          <td className="px-3 py-2">
                            {row.ok ? (
                              <span
                                className="text-green-600 dark:text-green-400"
                                title={row.message}
                              >
                                ✓ OK
                              </span>
                            ) : (
                              <span
                                className="text-red-600 dark:text-red-400"
                                title={row.message}
                              >
                                ✗ {truncate(row.message)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                            {row.status_code ?? "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                            {row.duration_ms}ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Distributor Configuration</CardTitle>
          <p className="text-sm text-gray-500">
            {configuredCount} of {totalCount} distributors configured
          </p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          size="sm"
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Distributor
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-gray-200 dark:divide-gray-800 border-t border-gray-200 dark:border-gray-800">
          {suppliers.map((s) => {
            const isExpanded = expanded[s.supplier] ?? false;
            const isSaving = saving[s.supplier] ?? false;
            const isTesting = testing[s.supplier] ?? false;
            const isSavingCurrency = currencySaving[s.supplier] ?? false;
            const result = testResults[s.supplier];
            const data = formData[s.supplier] ?? {};

            return (
              <div
                key={s.supplier}
                className="transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-900/30"
              >
                {/* Collapsed row */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(s.supplier)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(s.supplier);
                    }
                  }}
                  className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {s.display_name}
                      </div>
                      {s.is_custom && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                          Custom
                        </span>
                      )}
                    </div>
                    {result && !isExpanded && (
                      <div
                        className={
                          "text-xs mt-0.5 " +
                          (result.type === "success"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400")
                        }
                      >
                        {result.type === "success" ? "✓ " : "✗ "}
                        {result.message}
                      </div>
                    )}
                  </div>

                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      {isSavingCurrency && (
                        <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                      )}
                      <Select
                        value={s.preferred_currency ?? s.default_currency}
                        onValueChange={(v) => {
                          if (v) handleCurrencyChange(s, v);
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-8 w-20 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {s.supported_currencies.map((cur) => (
                            <SelectItem key={cur} value={cur}>
                              {cur}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {s.configured ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 whitespace-nowrap">
                        ● API Set
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 whitespace-nowrap">
                        Not Set
                      </span>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={!s.configured || isTesting}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTest(s);
                      }}
                    >
                      {isTesting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plug className="h-3 w-3" />
                      )}
                      <span className="ml-1">Test</span>
                    </Button>

                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="px-4 py-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-800">
                    {s.notes && (
                      <p className="mb-3 text-xs italic text-gray-500 dark:text-gray-400">
                        {s.notes}
                      </p>
                    )}
                    <a
                      href={s.docs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-4 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      API documentation
                      <ExternalLink className="h-3 w-3" />
                    </a>

                    {result && (
                      <div
                        className={
                          "mb-3 rounded-md border text-xs " +
                          (result.type === "success"
                            ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"
                            : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300")
                        }
                      >
                        <div className="flex items-start gap-2 px-3 py-2">
                          {result.type === "success" ? (
                            <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          ) : (
                            <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          )}
                          <span className="flex-1">{result.message}</span>
                          <button
                            type="button"
                            aria-label="Dismiss test result"
                            onClick={() => dismissResult(s.supplier)}
                            className="flex-shrink-0 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {result.raw_response !== undefined && (
                          <details className="border-t border-current/20 px-3 py-2">
                            <summary className="cursor-pointer select-none text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                              View raw API response
                            </summary>
                            <div className="mt-2 space-y-1.5">
                              <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400 break-all">
                                {result.status_code !== undefined && (
                                  <>Status: {result.status_code}</>
                                )}
                                {result.status_code !== undefined &&
                                  result.request_url && <> • </>}
                                {result.request_url && (
                                  <>URL: {result.request_url}</>
                                )}
                              </div>
                              <pre className="max-h-96 overflow-x-auto overflow-y-auto whitespace-pre rounded bg-gray-900 p-3 text-xs font-mono text-green-300 dark:bg-black">
                                {JSON.stringify(result.raw_response, null, 2)}
                              </pre>
                            </div>
                          </details>
                        )}
                      </div>
                    )}

                    <div className="space-y-3">
                      {s.fields.map((f) => {
                        const id = `cred-${s.supplier}-${f.key}`;
                        const existingPreview = s.preview[f.key];
                        const current = data[f.key] ?? "";
                        return (
                          <div key={f.key}>
                            <label
                              htmlFor={id}
                              className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                            >
                              {f.label}
                              {f.required && (
                                <span className="text-red-500"> *</span>
                              )}
                            </label>
                            {f.type === "select" ? (
                              <Select
                                value={current}
                                onValueChange={(v) => {
                                  if (v) updateField(s.supplier, f.key, v);
                                }}
                              >
                                <SelectTrigger id={id} className="h-8 text-xs">
                                  <SelectValue
                                    placeholder={
                                      existingPreview ??
                                      f.placeholder ??
                                      "Select..."
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {(f.options ?? []).map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                id={id}
                                type={
                                  f.type === "password" ? "password" : "text"
                                }
                                placeholder={
                                  f.type === "password" && s.configured
                                    ? "Leave blank to keep current"
                                    : (f.placeholder ?? "")
                                }
                                value={current}
                                onChange={(e) =>
                                  updateField(s.supplier, f.key, e.target.value)
                                }
                                disabled={isSaving}
                                autoComplete="off"
                                className="h-8 text-xs"
                              />
                            )}
                            {f.type === "password" && existingPreview && (
                              <p className="mt-1 font-mono text-[11px] text-gray-400">
                                Current: {existingPreview}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Test the API with a part number — MPN override input.
                        Empty → server uses per-distributor default. */}
                    <div className="mt-4 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/60">
                      <div className="mb-2 text-[11px] font-medium text-gray-600 dark:text-gray-400">
                        Test the API with a part number
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          placeholder={getDefaultMpn(s.supplier)}
                          value={testMpns[s.supplier] ?? ""}
                          onChange={(e) =>
                            setTestMpns((p) => ({
                              ...p,
                              [s.supplier]: e.target.value,
                            }))
                          }
                          disabled={!s.configured || isTesting}
                          autoComplete="off"
                          className="h-8 flex-1 font-mono text-xs"
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              s.configured &&
                              !isTesting
                            ) {
                              e.preventDefault();
                              handleTest(s, testMpns[s.supplier]);
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={!s.configured || isTesting}
                          onClick={() =>
                            handleTest(s, testMpns[s.supplier])
                          }
                        >
                          {isTesting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plug className="h-3 w-3" />
                          )}
                          <span className="ml-1">Test Connection</span>
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="text-[11px] text-gray-400 dark:text-gray-500">
                          {s.configured
                            ? `Updated ${relativeTime(s.updated_at)}`
                            : "Not yet configured"}
                        </div>
                        {s.is_custom && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                            disabled={deletingCustom[s.supplier] ?? false}
                            onClick={() => handleDeleteCustom(s)}
                          >
                            {deletingCustom[s.supplier] ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            <span className="ml-1">Delete distributor</span>
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={!s.configured || isTesting}
                          onClick={() => handleTest(s)}
                        >
                          {isTesting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plug className="h-3 w-3" />
                          )}
                          <span className="ml-1">Test Connection</span>
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={isSaving}
                          onClick={() => handleSave(s)}
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Check className="mr-1 h-3 w-3" />
                              Save
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={addDialogOpen} onOpenChange={handleAddDialogOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Custom Distributor</DialogTitle>
            <DialogDescription>
              Define a new distributor, its credential fields, and supported
              currencies. You can enter credentials after it is created.
            </DialogDescription>
          </DialogHeader>

          {addError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <X className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{addError}</span>
            </div>
          )}

          <div className="space-y-4 py-2">
            {/* Name */}
            <div>
              <label
                htmlFor="add-dist-name"
                className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                Name (internal key) <span className="text-red-500">*</span>
              </label>
              <Input
                id="add-dist-name"
                placeholder="octopart"
                value={addName}
                onChange={(e) => setAddName(e.target.value.toLowerCase())}
                disabled={addSubmitting}
                className="h-8 text-xs font-mono"
              />
              {addName && addNameError && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  {addNameError}
                </p>
              )}
            </div>

            {/* Display Name */}
            <div>
              <label
                htmlFor="add-dist-display"
                className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                Display Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="add-dist-display"
                placeholder="Octopart"
                value={addDisplayName}
                onChange={(e) => setAddDisplayName(e.target.value)}
                disabled={addSubmitting}
                className="h-8 text-xs"
              />
            </div>

            {/* Docs URL */}
            <div>
              <label
                htmlFor="add-dist-docs"
                className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                Docs URL (optional)
              </label>
              <Input
                id="add-dist-docs"
                placeholder="https://octopart.com/api"
                value={addDocsUrl}
                onChange={(e) => setAddDocsUrl(e.target.value)}
                disabled={addSubmitting}
                className="h-8 text-xs"
              />
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="add-dist-notes"
                className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                Notes (optional)
              </label>
              <textarea
                id="add-dist-notes"
                placeholder="Internal notes about this distributor"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                disabled={addSubmitting}
                rows={2}
                className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Supported Currencies */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Supported Currencies <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {STANDARD_CURRENCIES.map((cur) => {
                  const selected = addSupportedCurrencies.includes(cur);
                  return (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => toggleSupportedCurrency(cur)}
                      disabled={addSubmitting}
                      className={
                        "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors " +
                        (selected
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "border border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400")
                      }
                    >
                      {cur}
                    </button>
                  );
                })}
              </div>
              {addCurrenciesError && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  {addCurrenciesError}
                </p>
              )}
            </div>

            {/* Default Currency */}
            <div>
              <label
                htmlFor="add-dist-default-cur"
                className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                Default Currency <span className="text-red-500">*</span>
              </label>
              <Select
                value={addDefaultCurrency}
                onValueChange={(v) => {
                  if (v) setAddDefaultCurrency(v);
                }}
              >
                <SelectTrigger id="add-dist-default-cur" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(addSupportedCurrencies.length > 0
                    ? addSupportedCurrencies
                    : STANDARD_CURRENCIES
                  ).map((cur) => (
                    <SelectItem key={cur} value={cur}>
                      {cur}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addDefaultCurrencyError && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  {addDefaultCurrencyError}
                </p>
              )}
            </div>

            {/* Credential Fields editor */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Credential Fields <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {addFields.map((f, idx) => {
                  const keyErr = fieldKeyErrors[idx];
                  const labelErr = fieldLabelErrors[idx];
                  const isDupe = f.key && duplicateKeys.has(f.key);
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-800"
                    >
                      <div className="flex-1">
                        <Input
                          placeholder="field_key"
                          value={f.key}
                          onChange={(e) =>
                            updateDraftField(idx, {
                              key: e.target.value.toLowerCase(),
                            })
                          }
                          disabled={addSubmitting}
                          className="h-7 text-xs font-mono"
                        />
                        {(keyErr || isDupe) && (
                          <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">
                            {keyErr ?? "Duplicate key"}
                          </p>
                        )}
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder="Label"
                          value={f.label}
                          onChange={(e) =>
                            updateDraftField(idx, { label: e.target.value })
                          }
                          disabled={addSubmitting}
                          className="h-7 text-xs"
                        />
                        {labelErr && (
                          <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">
                            {labelErr}
                          </p>
                        )}
                      </div>
                      <div className="w-28">
                        <Select
                          value={f.type}
                          onValueChange={(v) => {
                            if (v)
                              updateDraftField(idx, {
                                type: v as FieldType,
                              });
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">text</SelectItem>
                            <SelectItem value="password">password</SelectItem>
                            <SelectItem value="select">select</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                        disabled={addSubmitting || addFields.length === 1}
                        onClick={() => removeDraftField(idx)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                disabled={addSubmitting}
                onClick={addDraftField}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Field
              </Button>
              {addFieldsError && addFields.length === 0 && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  {addFieldsError}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleAddDialogOpenChange(false)}
              disabled={addSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitAddDistributor}
              disabled={!addFormValid || addSubmitting}
            >
              {addSubmitting ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Distributor"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Card>
    </div>
  );
}

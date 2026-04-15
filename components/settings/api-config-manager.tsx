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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CredentialStatus } from "@/lib/supplier-credentials";

type Field = CredentialStatus["fields"][number];

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

type TestResult = { type: "success" | "error"; message: string };

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

  const configuredCount = suppliers.filter((s) => s.configured).length;
  const totalCount = suppliers.length;

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
    setTestResults((p) => ({ ...p, [supplier]: result }));
    setTimeout(() => {
      setTestResults((p) => {
        const { [supplier]: _unused, ...rest } = p;
        void _unused;
        return rest;
      });
    }, 8000);
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

  const handleTest = async (s: CredentialStatus) => {
    const supplier = s.supplier;
    setTesting((p) => ({ ...p, [supplier]: true }));
    setTestResults((p) => {
      const { [supplier]: _unused, ...rest } = p;
      void _unused;
      return rest;
    });
    try {
      const res = await fetch(
        `/api/admin/supplier-credentials/${supplier}/test`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        details?: unknown;
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
          message: `Connected${detailSuffix}`,
        });
      } else {
        showResult(supplier, {
          type: "error",
          message: json.message ?? "Connection failed",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showResult(supplier, { type: "error", message: msg });
    } finally {
      setTesting((p) => ({ ...p, [supplier]: false }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distributor Configuration</CardTitle>
        <CardDescription>
          {configuredCount} of {totalCount} distributors configured
        </CardDescription>
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
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {s.display_name}
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
                          "mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs " +
                          (result.type === "success"
                            ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"
                            : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300")
                        }
                      >
                        {result.type === "success" ? (
                          <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        ) : (
                          <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        )}
                        <span>{result.message}</span>
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

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-gray-400 dark:text-gray-500">
                        {s.configured
                          ? `Updated ${relativeTime(s.updated_at)}`
                          : "Not yet configured"}
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
    </Card>
  );
}

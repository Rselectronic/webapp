"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  Loader2,
  Trash2,
  Pencil,
  Plug,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const then = new Date(dateStr).getTime();
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
    const v = data[f.key];
    if (v) p[f.key] = f.type === "password" ? maskValue(v) : v;
  }
  return p;
}

type CurrencySaveState = "idle" | "saving" | "saved";

export function ApiConfigManager({ initialSuppliers }: ApiConfigManagerProps) {
  const [suppliers, setSuppliers] =
    useState<CredentialStatus[]>(initialSuppliers);
  const [dialogSupplier, setDialogSupplier] =
    useState<CredentialStatus | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formCurrency, setFormCurrency] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [busySupplier, setBusySupplier] = useState<string | null>(null);
  const [currencyState, setCurrencyState] = useState<
    Record<string, CurrencySaveState>
  >({});

  const configuredCount = suppliers.filter((s) => s.configured).length;
  const totalCount = suppliers.length;

  const openCreate = (s: CredentialStatus) => {
    setDialogSupplier(s);
    setDialogMode("create");
    setFormData({});
    setFormCurrency(s.preferred_currency ?? s.default_currency);
    setDialogError(null);
  };

  const openEdit = (s: CredentialStatus) => {
    setDialogSupplier(s);
    setDialogMode("edit");
    // Pre-fill non-password fields with their preview value only if not masked.
    // Simpler: leave all fields empty; user types what they want to change.
    setFormData({});
    setFormCurrency(s.preferred_currency ?? s.default_currency);
    setDialogError(null);
  };

  const closeDialog = () => {
    setDialogSupplier(null);
    setSaving(false);
    setDialogError(null);
    setTimeout(() => {
      setFormData({});
      setFormCurrency("");
    }, 150);
  };

  const handleSave = async () => {
    if (!dialogSupplier) return;
    setDialogError(null);

    // Validate required fields (create mode requires all; edit mode requires
    // none because password fields may be intentionally blank to preserve).
    if (dialogMode === "create") {
      const missing = dialogSupplier.fields.filter(
        (f) => f.required && !formData[f.key]?.trim()
      );
      if (missing.length > 0) {
        setDialogError(
          `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.map((m) => m.label).join(", ")}`
        );
        return;
      }
    }

    // Build body: drop blank password fields in edit mode so we don't
    // overwrite stored secrets. In create mode, include all typed values.
    const body: Record<string, string> = {};
    for (const f of dialogSupplier.fields) {
      const raw = formData[f.key];
      if (raw === undefined) continue;
      const val = f.type === "password" ? raw : raw.trim();
      if (!val) {
        if (dialogMode === "create" && f.required) {
          setDialogError(`Missing required field: ${f.label}`);
          return;
        }
        continue;
      }
      body[f.key] = val;
    }

    if (dialogMode === "edit" && Object.keys(body).length === 0) {
      // User only wants to change currency (or nothing) — still proceed,
      // PUT with empty data plus currency is valid per spec.
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/supplier-credentials/${dialogSupplier.supplier}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: body,
            preferred_currency: formCurrency,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ??
            "Failed to save credentials"
        );
      }

      // Merge the new preview with existing preview (so untouched password
      // fields keep showing their old masked values).
      const newlyMasked = buildPreview(dialogSupplier.fields, body);
      const mergedPreview: Record<string, string> = {
        ...(dialogMode === "edit" ? dialogSupplier.preview : {}),
        ...newlyMasked,
      };

      setSuppliers((prev) =>
        prev.map((s) =>
          s.supplier === dialogSupplier.supplier
            ? {
                ...s,
                configured: true,
                preview: mergedPreview,
                preferred_currency: formCurrency,
                updated_at: new Date().toISOString(),
              }
            : s
        )
      );
      toast.success(`${dialogSupplier.display_name} credentials saved`);
      closeDialog();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setDialogError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (s: CredentialStatus) => {
    const confirmed = window.confirm(
      `Revoke ${s.display_name} credentials? The pricing engine will stop calling this supplier until you reconfigure.`
    );
    if (!confirmed) return;
    setBusySupplier(s.supplier);
    try {
      const res = await fetch(
        `/api/admin/supplier-credentials/${s.supplier}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ??
            "Failed to revoke credentials"
        );
      }
      setSuppliers((prev) =>
        prev.map((x) =>
          x.supplier === s.supplier
            ? {
                ...x,
                configured: false,
                preview: {},
                preferred_currency: null,
                updated_at: null,
              }
            : x
        )
      );
      toast.success(`${s.display_name} credentials revoked`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setBusySupplier(null);
    }
  };

  const handleCurrencyChange = async (
    s: CredentialStatus,
    newCurrency: string
  ) => {
    // Optimistic update
    const previousCurrency = s.preferred_currency;
    setSuppliers((prev) =>
      prev.map((x) =>
        x.supplier === s.supplier
          ? { ...x, preferred_currency: newCurrency }
          : x
      )
    );
    setCurrencyState((p) => ({ ...p, [s.supplier]: "saving" }));

    try {
      const res = await fetch(
        `/api/admin/supplier-credentials/${s.supplier}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferred_currency: newCurrency }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? "Failed to update currency"
        );
      }
      setCurrencyState((p) => ({ ...p, [s.supplier]: "saved" }));
      setTimeout(
        () =>
          setCurrencyState((p) => ({ ...p, [s.supplier]: "idle" })),
        2000
      );
    } catch (err) {
      // Revert
      setSuppliers((prev) =>
        prev.map((x) =>
          x.supplier === s.supplier
            ? { ...x, preferred_currency: previousCurrency }
            : x
        )
      );
      setCurrencyState((p) => ({ ...p, [s.supplier]: "idle" }));
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {configuredCount}
          </span>{" "}
          / {totalCount} suppliers configured
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {suppliers.map((s) => {
          const busy = busySupplier === s.supplier;
          const currSaveState = currencyState[s.supplier] ?? "idle";
          return (
            <div
              key={s.supplier}
              className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {s.display_name}
                  </span>
                  <a
                    href={s.docs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    aria-label={`${s.display_name} documentation`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                {s.configured ? (
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                  >
                    Configured
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  >
                    Not Configured
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex-1 space-y-2 text-xs">
                {s.configured ? (
                  <>
                    {s.fields.map((f) => {
                      const val = s.preview[f.key];
                      if (!val) return null;
                      return (
                        <div
                          key={f.key}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-gray-500 dark:text-gray-400">
                            {f.label}
                          </span>
                          <span className="font-mono text-gray-700 dark:text-gray-300">
                            {val}
                          </span>
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-gray-500 dark:text-gray-400">
                        Currency
                      </span>
                      <div className="flex items-center gap-1">
                        {currSaveState === "saving" && (
                          <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                        )}
                        {currSaveState === "saved" && (
                          <span className="text-[10px] text-green-600 dark:text-green-400">
                            ✓ Saved
                          </span>
                        )}
                        <Select
                          value={
                            s.preferred_currency ?? s.default_currency
                          }
                          onValueChange={(v) => {
                            if (v) handleCurrencyChange(s, v);
                          }}
                        >
                          <SelectTrigger className="h-7 w-20 text-xs">
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
                    </div>

                    <div className="pt-1 text-[11px] text-gray-400 dark:text-gray-500">
                      Last updated {formatRelativeTime(s.updated_at)}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="italic text-gray-500 dark:text-gray-400">
                      Not configured yet
                    </p>
                    <p className="text-gray-500 dark:text-gray-400">
                      Default: {s.default_currency}
                    </p>
                  </>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                {s.configured ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEdit(s)}
                      disabled={busy}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                      onClick={() => handleRevoke(s)}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                      )}
                      Revoke
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => openCreate(s)}
                    disabled={busy}
                  >
                    <Plug className="mr-1 h-3.5 w-3.5" />
                    Configure
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!dialogSupplier}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {dialogSupplier && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialogMode === "create"
                    ? `Configure ${dialogSupplier.display_name}`
                    : `Edit ${dialogSupplier.display_name} Credentials`}
                </DialogTitle>
                <DialogDescription>
                  {dialogMode === "create"
                    ? "Enter the API credentials below. All values are AES-256 encrypted before storage."
                    : "Update credentials or currency. Leave password fields blank to keep existing values."}
                </DialogDescription>
              </DialogHeader>

              {(dialogSupplier.notes || dialogSupplier.docs_url) && (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900">
                  {dialogSupplier.notes && (
                    <p className="italic text-gray-600 dark:text-gray-400">
                      {dialogSupplier.notes}
                    </p>
                  )}
                  <a
                    href={dialogSupplier.docs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                  >
                    API documentation
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {dialogError && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{dialogError}</span>
                </div>
              )}

              <div className="space-y-3 py-1">
                {dialogSupplier.fields.map((f) => {
                  const id = `cred-${dialogSupplier.supplier}-${f.key}`;
                  const existingPreview =
                    dialogMode === "edit" && dialogSupplier.preview[f.key];
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
                          value={formData[f.key] ?? ""}
                          onValueChange={(v) => {
                            if (v)
                              setFormData((p) => ({ ...p, [f.key]: v }));
                          }}
                        >
                          <SelectTrigger id={id}>
                            <SelectValue
                              placeholder={f.placeholder ?? "Select..."}
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
                          type={f.type === "password" ? "password" : "text"}
                          placeholder={
                            dialogMode === "edit" && f.type === "password"
                              ? "Leave blank to keep current value"
                              : (f.placeholder ?? "")
                          }
                          value={formData[f.key] ?? ""}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              [f.key]: e.target.value,
                            }))
                          }
                          disabled={saving}
                          autoComplete="off"
                        />
                      )}

                      {dialogMode === "edit" &&
                        f.type === "password" &&
                        existingPreview && (
                          <p className="mt-1 font-mono text-[11px] text-gray-400">
                            Current: {existingPreview}
                          </p>
                        )}
                    </div>
                  );
                })}

                <div>
                  <label
                    htmlFor={`cred-${dialogSupplier.supplier}-currency`}
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    Preferred Currency
                  </label>
                  <Select
                    value={formCurrency}
                    onValueChange={(v) => {
                      if (v) setFormCurrency(v);
                    }}
                  >
                    <SelectTrigger
                      id={`cred-${dialogSupplier.supplier}-currency`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dialogSupplier.supported_currencies.map((cur) => (
                        <SelectItem key={cur} value={cur}>
                          {cur}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Save
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Copy, Check, AlertTriangle } from "lucide-react";
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
import { formatDateTime } from "@/lib/utils/format";

type ApiKeyRole = "admin" | "production";

export interface ApiKeyRow {
  id: string;
  name: string;
  role: ApiKeyRole;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface ApiKeysManagerProps {
  initialKeys: ApiKeyRow[];
}

const ROLE_OPTIONS: { value: ApiKeyRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "production", label: "Production" },
];

const ROLE_BADGE_CLASS: Record<ApiKeyRole, string> = {
  admin:
    "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  production:
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
};

const ROLE_LABEL: Record<ApiKeyRole, string> = {
  admin: "Admin",
  production: "Production",
};

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

export function ApiKeysManager({ initialKeys }: ApiKeysManagerProps) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<ApiKeyRole>("admin");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeCount = keys.filter((k) => !k.revoked_at).length;
  const revokedCount = keys.length - activeCount;

  const resetDialog = () => {
    setNewName("");
    setNewRole("admin");
    setRevealedKey(null);
    setCopied(false);
    setCreating(false);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      // Small delay so the dialog close animation doesn't show the form flashing back
      setTimeout(resetDialog, 150);
    }
  };

  const handleCreate = async () => {
    setError(null);
    if (!newName.trim()) {
      setError("Name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to create API key"
        );
      }
      const created = data as {
        id: string;
        name: string;
        role: ApiKeyRole;
        key: string;
        created_at: string;
      };
      // Prepend to local list so it appears without refresh
      setKeys((prev) => [
        {
          id: created.id,
          name: created.name,
          role: created.role,
          created_at: created.created_at,
          last_used_at: null,
          revoked_at: null,
        },
        ...prev,
      ]);
      setRevealedKey(created.key);
      toast.success("API key created");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleRevoke = async (row: ApiKeyRow) => {
    const confirmed = window.confirm(
      `Revoke "${row.name}"? Any AI agent using this key will stop working immediately.`
    );
    if (!confirmed) return;
    setRevokingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/api-keys/${row.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to revoke API key"
        );
      }
      const revokedAt =
        (data as { revoked_at?: string }).revoked_at ??
        new Date().toISOString();
      setKeys((prev) =>
        prev.map((k) =>
          k.id === row.id ? { ...k, revoked_at: revokedAt } : k
        )
      );
      toast.success(`Revoked "${row.name}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error(msg);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {activeCount}
          </span>{" "}
          active ·{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {revokedCount}
          </span>{" "}
          revoked
        </p>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New API Key
        </Button>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="rounded-md border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                Role
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                Created
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                Last Used
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                Status
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-gray-500"
                >
                  No API keys yet. Click{" "}
                  <span className="font-medium">New API Key</span> to create
                  one.
                </td>
              </tr>
            ) : (
              keys.map((row) => {
                const revoked = !!row.revoked_at;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-100 last:border-b-0 dark:border-gray-800 ${
                      revoked ? "opacity-60" : ""
                    }`}
                  >
                    <td
                      className={`px-3 py-2 font-medium ${
                        revoked ? "line-through text-gray-500" : ""
                      }`}
                    >
                      {row.name}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="secondary"
                        className={ROLE_BADGE_CLASS[row.role]}
                      >
                        {ROLE_LABEL[row.role]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                      {formatRelativeTime(row.last_used_at)}
                    </td>
                    <td className="px-3 py-2">
                      {revoked ? (
                        <Badge
                          variant="secondary"
                          className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        >
                          Revoked
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                        >
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {revoked ? null : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(row)}
                          disabled={revokingId === row.id}
                        >
                          {revokingId === row.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          {revealedKey ? (
            <>
              <DialogHeader>
                <DialogTitle>API Key Created</DialogTitle>
                <DialogDescription>
                  Save this key now — it will never be shown again.
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  This is the only time the raw key will be shown. Copy it
                  somewhere safe before closing this dialog.
                </p>
              </div>

              <div className="select-all break-all rounded bg-gray-900 px-4 py-3 font-mono text-sm text-green-400">
                {revealedKey}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy to Clipboard
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleDialogOpenChange(false)}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>New API Key</DialogTitle>
                <DialogDescription>
                  Create a permanent API key for an AI agent. The raw key will
                  be shown once after creation.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <label
                    htmlFor="api-key-name"
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="api-key-name"
                    placeholder="Claude Desktop - Anas"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <div>
                  <label
                    htmlFor="api-key-role"
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    Role
                  </label>
                  <Select
                    value={newRole}
                    onValueChange={(v) => {
                      if (v) setNewRole(v as ApiKeyRole);
                    }}
                  >
                    <SelectTrigger id="api-key-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
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
                  onClick={() => handleDialogOpenChange(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Key"
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

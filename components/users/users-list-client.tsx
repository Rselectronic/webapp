"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, KeyRound, UserMinus, UserPlus, Pencil } from "lucide-react";
import { AddUserDialog } from "./add-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import {
  isAdminRole,
  isProductionRole,
  roleLabel,
} from "@/lib/auth/roles";

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
  last_seen_at: string | null;
  last_sign_in_at: string | null;
}

interface Props {
  initialUsers: UserRow[];
  currentUserId: string;
}

type Filter = "all" | "admin" | "production" | "inactive";

function formatTimestamp(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDateTime(s);
}

export function UsersListClient({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "admin" && !isAdminRole(u.role)) return false;
      if (filter === "production" && !isProductionRole(u.role)) return false;
      if (filter === "inactive" && u.is_active) return false;
      if (q) {
        const hay = `${u.full_name} ${u.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, filter]);

  function patchUser(id: string, patch: Partial<UserRow>) {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...patch } : u))
    );
  }

  async function toggleActive(target: UserRow) {
    if (target.id === currentUserId) {
      toast.error("You cannot deactivate your own account.");
      return;
    }
    setStatusBusy(target.id);
    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !target.is_active }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Update failed");
      patchUser(target.id, { is_active: !target.is_active });
      toast.success(
        !target.is_active
          ? `${target.full_name} reactivated`
          : `${target.full_name} deactivated`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setStatusBusy(null);
    }
  }

  async function confirmReset() {
    if (!resetTarget) return;
    setResetting(true);
    setResetLink(null);
    try {
      const res = await fetch(`/api/users/${resetTarget.id}/reset-password`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Failed to generate link");
      if (j.action_link) {
        setResetLink(j.action_link as string);
        toast.success("Recovery link generated");
      } else {
        toast.success("Recovery email sent");
        setResetTarget(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setResetting(false);
    }
  }

  function handleCreated(u: UserRow) {
    setUsers((prev) => [...prev, u]);
    setAddOpen(false);
  }

  function handleEdited(u: UserRow) {
    patchUser(u.id, u);
    setEditTarget(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="max-w-xs"
        />

        <div className="flex items-center gap-1 rounded-md border bg-white p-0.5 dark:bg-gray-900">
          {(["all", "admin", "production", "inactive"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300"
              }`}
            >
              {f === "all"
                ? "All"
                : f === "admin"
                  ? "Admin"
                  : f === "production"
                    ? "Production"
                    : "Inactive"}
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-500">
          {filtered.length} of {users.length}
        </span>

        <div className="ml-auto">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              No users match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-2">Full name</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Last sign-in</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const isSelf = u.id === currentUserId;
                    return (
                      <tr
                        key={u.id}
                        className="border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-900"
                      >
                        <td className="px-4 py-2 font-medium">
                          {u.full_name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-gray-400">
                              (you)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{u.email}</td>
                        <td className="px-4 py-2">
                          <Badge variant="secondary">{roleLabel(u.role)}</Badge>
                        </td>
                        <td className="px-4 py-2">
                          {u.is_active ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              Active
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200">
                              Inactive
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {formatTimestamp(u.last_sign_in_at)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditTarget(u)}
                              title="Edit user"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setResetLink(null);
                                setResetTarget(u);
                              }}
                              title="Reset password"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            {!isSelf && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={statusBusy === u.id}
                                onClick={() => toggleActive(u)}
                                title={
                                  u.is_active
                                    ? "Deactivate user"
                                    : "Reactivate user"
                                }
                              >
                                {u.is_active ? (
                                  <UserMinus className="h-3.5 w-3.5 text-red-600" />
                                ) : (
                                  <UserPlus className="h-3.5 w-3.5 text-green-600" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <AddUserDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={handleCreated}
        />
      )}

      {editTarget && (
        <EditUserDialog
          open={!!editTarget}
          user={editTarget}
          isSelf={editTarget.id === currentUserId}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          onSaved={handleEdited}
        />
      )}

      <AlertDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setResetLink(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password?</AlertDialogTitle>
            <AlertDialogDescription>
              {resetTarget && !resetLink && (
                <>
                  Generate a password recovery link for{" "}
                  <strong>{resetTarget.full_name}</strong> (
                  {resetTarget.email}). If Supabase SMTP is configured, an
                  email will also be sent automatically.
                </>
              )}
              {resetLink && (
                <span className="block">
                  Recovery link generated. Copy this and send it to the user
                  manually if SMTP is not configured. The link is single-use.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {resetLink && (
            <div className="my-2 rounded-md border bg-gray-50 p-2 text-xs break-all dark:bg-gray-900">
              {resetLink}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>
              {resetLink ? "Close" : "Cancel"}
            </AlertDialogCancel>
            {!resetLink && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmReset();
                }}
                disabled={resetting}
              >
                {resetting ? "Generating…" : "Generate link"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

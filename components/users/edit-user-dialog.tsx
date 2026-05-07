"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { isAdminRole, isProductionRole } from "@/lib/auth/roles";
import type { UserRow } from "./users-list-client";

interface Props {
  open: boolean;
  user: UserRow;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (u: UserRow) => void;
}

// Pick a "canonical" role bucket for the radio control. Legacy values
// (ceo / operations_manager → admin, shop_floor → production) snap to the
// matching bucket without changing the underlying DB value unless the user
// actually picks a different bucket.
function bucketOf(role: string): "admin" | "production" {
  if (isProductionRole(role)) return "production";
  if (isAdminRole(role)) return "admin";
  return "production";
}

export function EditUserDialog({
  open,
  user,
  isSelf,
  onOpenChange,
  onSaved,
}: Props) {
  const initialBucket = bucketOf(user.role);
  const [fullName, setFullName] = useState(user.full_name);
  const [bucket, setBucket] = useState<"admin" | "production">(initialBucket);
  const [isActive, setIsActive] = useState(user.is_active);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }

    const patch: Record<string, unknown> = {};
    if (fullName.trim() !== user.full_name) patch.full_name = fullName.trim();

    // Only send `role` if the user actually picked a different bucket. This
    // way Anas's `ceo` row stays `ceo` unless the admin explicitly switches
    // them to "production".
    if (bucket !== initialBucket) {
      patch.role = bucket;
    }
    if (isActive !== user.is_active) patch.is_active = isActive;

    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Update failed");
      onSaved({
        ...user,
        full_name: j.full_name ?? user.full_name,
        role: j.role ?? user.role,
        is_active: typeof j.is_active === "boolean" ? j.is_active : user.is_active,
      });
      toast.success("User updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            {user.email}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit_fullName">Full name</Label>
            <Input
              id="edit_fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBucket("admin")}
                disabled={isSelf && initialBucket === "admin"}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  bucket === "admin"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => setBucket("production")}
                disabled={isSelf}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  bucket === "production"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Production
              </button>
            </div>
            {isSelf && (
              <p className="text-xs text-gray-500">
                You cannot change your own role.
              </p>
            )}
          </div>

          {!isSelf && (
            <div className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2 dark:bg-gray-900">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-gray-500">
                  Inactive users cannot sign in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isActive ? "bg-green-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    isActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

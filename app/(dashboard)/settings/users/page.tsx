import { isAdminRole } from "@/lib/auth/roles";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  UsersListClient,
  type UserRow,
} from "@/components/users/users-list-client";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || !isAdminRole(profile?.role)) {
    redirect("/");
  }

  // Use the admin client for the listing so we can read every user without
  // depending on the existing RLS policies (which are scoped to specific
  // operational paths). This page is admin-only by virtue of the redirect
  // above â€” the admin client is gated behind that check.
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("users")
    .select("id, email, full_name, role, is_active, created_at, last_seen_at")
    .order("created_at", { ascending: true });

  // Pull last_sign_in_at from auth.users (~5-10 users; one page is plenty).
  const lastSignIn = new Map<string, string | null>();
  try {
    const { data: authList } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    for (const u of authList?.users ?? []) {
      lastSignIn.set(u.id, u.last_sign_in_at ?? null);
    }
  } catch {
    // Non-fatal â€” column just renders blank.
  }

  const users: UserRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    role: r.role,
    is_active: !!r.is_active,
    created_at: r.created_at,
    last_seen_at: r.last_seen_at,
    last_sign_in_at: lastSignIn.get(r.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </Link>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">Users</h2>
        <p className="text-sm text-gray-500">
          Manage who can sign in. Admins see everything; production users only
          see the Production module.
        </p>
      </div>

      <UsersListClient initialUsers={users} currentUserId={user.id} />
    </div>
  );
}

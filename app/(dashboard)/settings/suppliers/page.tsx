import { isAdminRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SuppliersListClient } from "@/components/suppliers/suppliers-list-client";
export const dynamic = "force-dynamic";

export default async function SuppliersListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) {
    redirect("/");
  }

  // Initial server-side fetch â€” subsequent updates are client-side via fetch.
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select(
      `id, code, legal_name, category, default_currency, payment_terms,
       billing_address, is_approved, online_only, notes, created_at, updated_at`
    )
    .order("code");

  // Pull every contact in one go so we can compute both the per-supplier
  // count AND surface the primary contact's name + email on the list. We
  // sort is_primary DESC so the primary always lands first when we group
  // by supplier_id.
  const ids = (suppliers ?? []).map((s) => s.id);
  const counts = new Map<string, number>();
  const primaryByCode = new Map<string, { name: string; email: string | null }>();
  if (ids.length > 0) {
    const { data: contacts } = await supabase
      .from("supplier_contacts")
      .select("supplier_id, name, email, is_primary")
      .in("supplier_id", ids)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    for (const row of contacts ?? []) {
      counts.set(row.supplier_id, (counts.get(row.supplier_id) ?? 0) + 1);
      // First contact we see per supplier wins. Because of the ORDER BY,
      // that's the primary one; if no primary exists, it falls back to
      // the oldest contact so the operator still sees a default.
      if (!primaryByCode.has(row.supplier_id) && row.name) {
        primaryByCode.set(row.supplier_id, {
          name: row.name,
          email: row.email ?? null,
        });
      }
    }
  }

  const enriched = (suppliers ?? []).map((s) => ({
    ...s,
    contact_count: counts.get(s.id) ?? 0,
    primary_contact: primaryByCode.get(s.id) ?? null,
  }));

  const isCeo = isAdminRole(profile?.role);

  return (
    <div className="space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </Link>
      <SuppliersListClient initialSuppliers={enriched} isCeo={isCeo} />
    </div>
  );
}

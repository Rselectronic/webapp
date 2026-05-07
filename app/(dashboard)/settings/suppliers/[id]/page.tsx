import { isAdminRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SupplierDetailClient } from "@/components/suppliers/supplier-detail-client";
import type { Supplier, SupplierContact } from "@/lib/suppliers/types";
export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: supplier } = await supabase
    .from("suppliers")
    .select(
      `id, code, legal_name, category, default_currency, payment_terms,
       billing_address, is_approved, online_only, notes, created_at, updated_at`
    )
    .eq("id", id)
    .maybeSingle();

  if (!supplier) notFound();

  const { data: contacts } = await supabase
    .from("supplier_contacts")
    .select("id, supplier_id, name, email, phone, title, is_primary, notes, created_at, updated_at")
    .eq("supplier_id", id)
    .order("is_primary", { ascending: false })
    .order("name");

  const isCeo = isAdminRole(profile?.role);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/settings/suppliers"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to suppliers
      </Link>

      <SupplierDetailClient
        supplier={supplier as Supplier}
        contacts={(contacts ?? []) as SupplierContact[]}
        isCeo={isCeo}
      />
    </div>
  );
}

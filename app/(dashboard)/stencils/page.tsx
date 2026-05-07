import { createAdminClient, createClient } from "@/lib/supabase/server";
import { StencilsLibraryManager, type StencilRow } from "@/components/stencils/stencils-library-manager";

export const dynamic = "force-dynamic";

export default async function StencilsPage() {
  const supabase = await createClient();
  // Display-only lookup of discarder names. The user-scoped client is
  // gated by `users_admin_full` (admin-only) + `users_self_read` (own
  // row), so a production viewer can resolve their own name but not an
  // admin's — leaving the "By" column blank when Anas discarded a
  // stencil. Use the service-role client for this specific name lookup
  // so both roles render correctly.
  const adminSupabase = createAdminClient();

  const { data: rows } = await supabase
    .from("stencils_library")
    .select(
      "id, position_no, stencil_name, comments, discarded_at, discarded_reason, discarded_by, created_at, updated_at"
    );

  const ids = (rows ?? []).map((r) => r.id);
  const gmpsByStencil = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: gmpRows } = await supabase
      .from("stencils_library_gmps")
      .select("stencil_id, gmp_number")
      .in("stencil_id", ids);
    for (const r of (gmpRows ?? []) as { stencil_id: string; gmp_number: string }[]) {
      const arr = gmpsByStencil.get(r.stencil_id) ?? [];
      arr.push(r.gmp_number);
      gmpsByStencil.set(r.stencil_id, arr);
    }
  }

  // Discarded user names for display.
  const discarderIds = Array.from(
    new Set((rows ?? []).map((r) => r.discarded_by).filter((v): v is string => !!v))
  );
  const nameById = new Map<string, string>();
  if (discarderIds.length > 0) {
    const { data: users } = await adminSupabase
      .from("users")
      .select("id, full_name, email")
      .in("id", discarderIds);
    for (const u of (users ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      nameById.set(u.id, u.full_name ?? u.email ?? u.id);
    }
  }

  // Full GMP list for the add/edit multi-select picker.
  const { data: gmpList } = await supabase
    .from("gmps")
    .select("gmp_number, board_name, customers(code, company_name)")
    .order("gmp_number", { ascending: true });
  const gmpOptions = (gmpList ?? []).map((g) => {
    const c = g.customers as unknown as { code: string; company_name: string } | null;
    return {
      gmp_number: g.gmp_number as string,
      board_name: (g.board_name as string | null) ?? null,
      customer_code: c?.code ?? null,
      customer_name: c?.company_name ?? null,
    };
  });

  const stencils: StencilRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    position_no: r.position_no,
    stencil_name: r.stencil_name,
    comments: r.comments ?? null,
    discarded_at: r.discarded_at ?? null,
    discarded_reason: r.discarded_reason ?? null,
    discarded_by: r.discarded_by ?? null,
    discarded_by_name: r.discarded_by ? nameById.get(r.discarded_by) ?? null : null,
    gmps: gmpsByStencil.get(r.id) ?? [],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Stencil Library</h2>
        <p className="mt-1 text-gray-500">
          Physical stencils on the shop shelves. Discarded stencils are kept as audit records; their
          position numbers are auto-reused when new stencils are added.
        </p>
      </div>

      <StencilsLibraryManager initial={stencils} gmpOptions={gmpOptions} />
    </div>
  );
}

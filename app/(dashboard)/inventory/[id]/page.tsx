import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/(dashboard)/inventory/[id]/page.tsx
// Inventory part detail page. Server-renders the part + its last 100
// movements; the client component owns inline patching for edits + manual
// adjustments.
// ----------------------------------------------------------------------------

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { InventoryDetailClient } from "@/components/inventory/inventory-detail-client";
import type {
  InventoryMovement,
  InventoryPartStock,
  SerialHistoryRow,
} from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InventoryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Operator's display name + role â€” used both for the gate and for
  // the detail client's optimistic updates so newly-written serial-history
  // rows render the correct "Assigned by" name immediately, instead of "â€”"
  // until a refresh.
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) redirect("/");
  const currentUserName: string | null = profile?.full_name ?? null;

  const { data: part } = await supabase
    .from("inventory_part_stock")
    .select(
      "id, serial_no, cpc, mpn, manufacturer, description, pool, min_stock_threshold, is_active, notes, created_at, updated_at, physical_qty, reserved_qty, available_qty",
    )
    .eq("id", id)
    .maybeSingle();

  if (!part) notFound();

  // Last 100 movements â€” paginated UI lands later.
  // Hint the FK by constraint name so PostgREST returns the joined user.
  // The colon-alias syntax (`users:created_by`) is for renames, not FK
  // hints, and silently produces no embed â€” leaving the ledger to render
  // the truncated user UUID.
  const { data: movementsRaw } = await supabase
    .from("inventory_movements")
    .select(
      `id, inventory_part_id, delta, kind, proc_id, po_id, job_id,
       qty_before, qty_after, notes, created_by, created_at,
       users!inventory_movements_created_by_fkey(id, full_name)`,
    )
    .eq("inventory_part_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  // Flatten the joined user so MovementsLedger can read `created_by_name`
  // directly â€” keeps the rendering side dumb.
  const movements = (movementsRaw ?? []).map((row) => {
    const r = row as typeof row & {
      users?:
        | { full_name?: string | null }
        | Array<{ full_name?: string | null }>
        | null;
    };
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return { ...r, created_by_name: u?.full_name ?? null };
  });

  // Active reservations â€” pulls every allocation against this part and joins
  // the parent procurement + customer for display. We include consumed +
  // released rows too (newest first, capped at 50) so the operator can see
  // recent history without leaving the page. The PROC link lets them drill
  // into the corresponding stock-allocations panel for context.
  const { data: allocsRaw } = await supabase
    .from("inventory_allocations")
    .select(
      `id, qty_allocated, status, notes, created_at, consumed_at, released_at, procurement_id,
       procurements!inventory_allocations_procurement_id_fkey(
         id, proc_code,
         customers(code, company_name)
       ),
       users!inventory_allocations_created_by_fkey(full_name)`,
    )
    .eq("inventory_part_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Flatten joined relations for the client component.
  type RawAlloc = {
    id: string;
    qty_allocated: number;
    status: string;
    notes: string | null;
    created_at: string;
    consumed_at: string | null;
    released_at: string | null;
    procurement_id: string;
    procurements:
      | {
          id: string;
          proc_code: string | null;
          customers:
            | { code: string | null; company_name: string | null }
            | { code: string | null; company_name: string | null }[]
            | null;
        }
      | Array<{
          id: string;
          proc_code: string | null;
          customers:
            | { code: string | null; company_name: string | null }
            | { code: string | null; company_name: string | null }[]
            | null;
        }>
      | null;
    users:
      | { full_name?: string | null }
      | Array<{ full_name?: string | null }>
      | null;
  };
  // Serial assignment history for this part â€” every (slot â†” part) mapping
  // we've ever recorded, newest first. Joins assigned_by and unassigned_by
  // through the FK constraints to render full names instead of UUIDs.
  const { data: serialHistRaw } = await supabase
    .from("inventory_serial_history")
    .select(
      `id, serial_no, inventory_part_id, assigned_at, unassigned_at, notes,
       assigned_user:users!inventory_serial_history_assigned_by_fkey(full_name),
       unassigned_user:users!inventory_serial_history_unassigned_by_fkey(full_name)`,
    )
    .eq("inventory_part_id", id)
    .order("assigned_at", { ascending: false });

  type RawSerialHist = {
    id: string;
    serial_no: string;
    inventory_part_id: string;
    assigned_at: string;
    unassigned_at: string | null;
    notes: string | null;
    assigned_user:
      | { full_name?: string | null }
      | Array<{ full_name?: string | null }>
      | null;
    unassigned_user:
      | { full_name?: string | null }
      | Array<{ full_name?: string | null }>
      | null;
  };
  const serialHistory: SerialHistoryRow[] = ((serialHistRaw ?? []) as RawSerialHist[]).map(
    (h) => {
      const assignedUser = Array.isArray(h.assigned_user)
        ? h.assigned_user[0]
        : h.assigned_user;
      const unassignedUser = Array.isArray(h.unassigned_user)
        ? h.unassigned_user[0]
        : h.unassigned_user;
      return {
        id: h.id,
        serial_no: h.serial_no,
        inventory_part_id: h.inventory_part_id,
        assigned_at: h.assigned_at,
        unassigned_at: h.unassigned_at,
        notes: h.notes,
        assigned_by_name: assignedUser?.full_name ?? null,
        unassigned_by_name: unassignedUser?.full_name ?? null,
      };
    },
  );

  const allocations = ((allocsRaw ?? []) as RawAlloc[]).map((a) => {
    const proc = Array.isArray(a.procurements) ? a.procurements[0] : a.procurements;
    const customer = proc?.customers
      ? Array.isArray(proc.customers)
        ? proc.customers[0]
        : proc.customers
      : null;
    const userObj = Array.isArray(a.users) ? a.users[0] : a.users;
    return {
      id: a.id,
      qty_allocated: a.qty_allocated,
      status: a.status as "reserved" | "consumed" | "released",
      notes: a.notes,
      created_at: a.created_at,
      consumed_at: a.consumed_at,
      released_at: a.released_at,
      procurement_id: a.procurement_id,
      proc_code: proc?.proc_code ?? null,
      customer_code: customer?.code ?? null,
      customer_name: customer?.company_name ?? null,
      created_by_name: userObj?.full_name ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <Link href="/inventory">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Inventory
        </Button>
      </Link>

      <InventoryDetailClient
        initialPart={part as InventoryPartStock}
        initialMovements={(movements ?? []) as InventoryMovement[]}
        initialAllocations={allocations}
        initialSerialHistory={serialHistory}
        currentUserName={currentUserName}
      />
    </div>
  );
}
